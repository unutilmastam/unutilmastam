import { z } from 'zod';
import { parseCategories, parseProducts } from '../../domain/catalog';
import { toTashkent } from '../../domain/schedule';
import { siteOverview } from '../../domain/site-overview';
import type { CatalogSource } from '../../integrations/firestore';
import type { Db } from '../../lib/db';
import { AppError } from '../../lib/errors';
import { redactText } from '../../lib/logger';
import { writeAudit } from '../audit';

export const INTEGRATION_FIRESTORE = 'firestore';

export const firestoreSettingsSchema = z.object({
  syncEnabled: z.boolean(),
  intervalMinutes: z.number().int().min(5).max(1440),
});
export type FirestoreSettings = z.infer<typeof firestoreSettingsSchema>;
export const DEFAULT_FIRESTORE_SETTINGS: FirestoreSettings = { syncEnabled: true, intervalMinutes: 30 };

/** Records the outcome of a real call. CONNECTED is only ever set here, after a successful call. */
export async function markIntegration(
  db: Db,
  key: string,
  outcome: { ok: true; at: Date } | { ok: false; error: string; at: Date },
): Promise<void> {
  const data = outcome.ok
    ? { status: 'CONNECTED' as const, lastCheckedAt: outcome.at, lastSuccessAt: outcome.at, lastError: null }
    : { status: 'ERROR' as const, lastCheckedAt: outcome.at, lastError: outcome.error.slice(0, 500) };
  await db.integration.upsert({ where: { key }, create: { key, ...data }, update: data });
}

export class IntegrationService {
  constructor(
    private readonly db: Db,
    private readonly getSource: () => CatalogSource | null,
    private readonly configured: () => boolean,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Brings the stored status in line with the configuration (no credentials -> NOT_CONFIGURED). */
  async firestoreStatus() {
    const configured = this.configured();
    let row = await this.db.integration.findUnique({ where: { key: INTEGRATION_FIRESTORE } });
    const wanted = !configured ? 'NOT_CONFIGURED' : row && row.status !== 'NOT_CONFIGURED' ? row.status : 'CONFIGURED';
    if (!row || row.status !== wanted) {
      row = await this.db.integration.upsert({
        where: { key: INTEGRATION_FIRESTORE },
        create: { key: INTEGRATION_FIRESTORE, status: wanted, settings: DEFAULT_FIRESTORE_SETTINGS },
        update: { status: wanted },
      });
    }
    const settings = firestoreSettingsSchema.safeParse(row.settings);
    const runs = await this.db.productSyncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 });
    const lastSuccess = await this.db.productSyncRun.findFirst({
      where: { status: { in: ['SUCCEEDED', 'APPLIED_AFTER_HOLD'] } },
      orderBy: { startedAt: 'desc' },
    });
    return {
      key: row.key,
      status: row.status,
      lastCheckedAt: row.lastCheckedAt,
      lastSuccessAt: row.lastSuccessAt,
      lastError: row.lastError,
      settings: settings.success ? settings.data : DEFAULT_FIRESTORE_SETTINGS,
      lastSuccessfulSyncAt: lastSuccess?.finishedAt ?? null,
      runs,
    };
  }

  /** Live read of the website (read-only, nothing is stored) for the "Sayt" page (D-019). */
  async siteOverview() {
    const source = this.getSource();
    if (!source?.fetchSite) throw new AppError(409, 'not_configured', 'Firestore integratsiyasi sozlanmagan');
    try {
      const s = await source.fetchSite();
      await markIntegration(this.db, INTEGRATION_FIRESTORE, { ok: true, at: this.now() });
      return {
        readAt: this.now(),
        sourceUpdatedAt: s.products.updatedAtMs ? new Date(s.products.updatedAtMs) : null,
        ...siteOverview(
          {
            products: s.products.value,
            stores: s.stores.value,
            users: s.users.value,
            orders: s.orders.value,
            ledger: s.ledger.value,
          },
          toTashkent(this.now()).date,
        ),
      };
    } catch (err) {
      const message = redactText(err instanceof Error ? err.message : String(err));
      await markIntegration(this.db, INTEGRATION_FIRESTORE, { ok: false, error: message, at: this.now() });
      throw new AppError(502, 'firestore_failed', `Saytdan o'qib bo'lmadi: ${message}`);
    }
  }

  async testFirestore(actorUserId: string) {
    const source = this.getSource();
    if (!source) throw new AppError(409, 'not_configured', 'Firestore integratsiyasi sozlanmagan');
    try {
      const snap = await source.fetchCatalog();
      const parsed = parseProducts(snap.products.value ?? '[]', parseCategories(snap.categories.value));
      await markIntegration(this.db, INTEGRATION_FIRESTORE, { ok: true, at: this.now() });
      await writeAudit(this.db, { actor: { type: 'user', id: actorUserId }, action: 'integration.firestore_tested' });
      return {
        ok: true as const,
        productCount: parsed.products.length,
        invalidCount: parsed.invalid.length,
        sourceUpdatedAt: snap.products.updatedAtMs ? new Date(snap.products.updatedAtMs) : null,
      };
    } catch (err) {
      const message = redactText(err instanceof Error ? err.message : String(err));
      await markIntegration(this.db, INTEGRATION_FIRESTORE, { ok: false, error: message, at: this.now() });
      return { ok: false as const, error: message };
    }
  }

  async updateFirestoreSettings(settings: FirestoreSettings, actorUserId: string) {
    await this.firestoreStatus();
    await this.db.integration.update({ where: { key: INTEGRATION_FIRESTORE }, data: { settings } });
    await writeAudit(this.db, {
      actor: { type: 'user', id: actorUserId },
      action: 'integration.firestore_settings',
      details: settings,
    });
  }
}
