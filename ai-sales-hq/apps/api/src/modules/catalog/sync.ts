import { randomUUID } from 'node:crypto';
import {
  availabilityFor,
  type CatalogDiff,
  diffCatalog,
  type ExistingProduct,
  holdReason,
  normalizeProductName,
  parseCategories,
  parseProducts,
} from '../../domain/catalog';
import type { ProductSyncRun } from '../../generated/prisma/client';
import type { CatalogSource } from '../../integrations/firestore';
import type { Db } from '../../lib/db';
import { AppError, conflict } from '../../lib/errors';
import { acquireLock, releaseLock } from '../../lib/locks';
import { redactText } from '../../lib/logger';
import { writeAudit } from '../audit';
import { INTEGRATION_FIRESTORE, markIntegration } from '../integrations/service';
import { notify, resolveNotification } from '../notifications/service';

const LOCK = 'catalog-sync';
const LOCK_TTL_MS = 5 * 60_000;
const REPORT_LIMIT = 50;

export interface SyncOptions {
  trigger: 'SCHEDULED' | 'MANUAL' | 'OWNER_APPROVED';
  actorUserId?: string;
  // Apply even if the mass-change guard would hold the run (owner approved the held diff).
  force?: boolean;
}

export class CatalogSyncService {
  constructor(
    private readonly db: Db,
    private readonly getSource: () => CatalogSource | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(opts: SyncOptions): Promise<ProductSyncRun> {
    const source = this.getSource();
    if (!source) throw new AppError(409, 'not_configured', 'Firestore integratsiyasi sozlanmagan');
    const holder = randomUUID();
    if (!(await acquireLock(this.db, LOCK, holder, LOCK_TTL_MS, this.now()))) {
      throw conflict('sync_running', 'Sinxronizatsiya allaqachon ishlayapti');
    }
    const run = await this.db.productSyncRun.create({
      data: {
        source: 'FIRESTORE',
        trigger: opts.trigger,
        status: 'RUNNING',
        startedAt: this.now(),
        actorUserId: opts.actorUserId ?? null,
      },
    });
    try {
      return await this.#execute(run.id, source, opts);
    } catch (err) {
      const message = redactText(err instanceof Error ? err.message : String(err)).slice(0, 500);
      const failed = await this.db.productSyncRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', finishedAt: this.now(), errorMessage: message },
      });
      await markIntegration(this.db, INTEGRATION_FIRESTORE, { ok: false, error: message, at: this.now() });
      await notify(
        this.db,
        {
          kind: 'catalog.sync_failed',
          severity: 'CRITICAL',
          title: 'Mahsulotlar sinxronizatsiyasi muvaffaqiyatsiz',
          body: message,
          link: '/integrations/',
          dedupeKey: 'catalog-sync-failed',
        },
        this.now(),
      );
      return failed;
    } finally {
      await releaseLock(this.db, LOCK, holder);
    }
  }

  async #execute(runId: string, source: CatalogSource, opts: SyncOptions): Promise<ProductSyncRun> {
    const snapshot = await source.fetchCatalog();
    const parsed = parseProducts(snapshot.products.value ?? '[]', parseCategories(snapshot.categories.value));
    const existing = await this.#existing();
    const diff = diffCatalog(existing, parsed.products);
    const activeCount = existing.filter((p) => p.isActive).length;
    const reason = opts.force ? null : holdReason(activeCount, parsed.products.length, diff);
    const sourceUpdatedAt = snapshot.products.updatedAtMs ? new Date(snapshot.products.updatedAtMs) : null;
    const counts = {
      fetchedCount: parsed.products.length,
      createdCount: diff.create.length,
      updatedCount: diff.update.length,
      deactivatedCount: diff.deactivate.length,
      priceChangeCount:
        diff.priceChanges.filter((c) => c.from !== null).length +
        diff.wholesaleChanges.filter((c) => c.from !== null).length,
      invalidCount: parsed.invalid.length,
    };
    // Plain JSON for the report column.
    const report = JSON.parse(
      JSON.stringify({
        invalid: parsed.invalid.slice(0, REPORT_LIMIT),
        priceChanges: diff.priceChanges
          .filter((c) => c.from !== null)
          .slice(0, REPORT_LIMIT)
          .map((c) => ({ externalId: c.externalId, from: Number(c.from), to: Number(c.to) })),
        wholesaleChanges: diff.wholesaleChanges
          .slice(0, REPORT_LIMIT)
          .map((c) => ({ externalId: c.externalId, from: c.from === null ? null : Number(c.from), to: Number(c.to) })),
        deactivated: diff.deactivate.slice(0, REPORT_LIMIT),
      }),
    ) as object;

    // The Firestore call itself succeeded.
    await markIntegration(this.db, INTEGRATION_FIRESTORE, { ok: true, at: this.now() });
    await resolveNotification(this.db, 'catalog-sync-failed', this.now());

    if (reason) {
      const held = await this.db.productSyncRun.update({
        where: { id: runId },
        data: { status: 'HELD', finishedAt: this.now(), heldReason: reason, sourceUpdatedAt, report, ...counts },
      });
      await notify(
        this.db,
        {
          kind: 'catalog.sync_held',
          severity: 'WARNING',
          title: "Mahsulotlar o'zgarishi to'xtatildi",
          body: `${reason}. Ko'rib chiqing va tasdiqlang yoki rad eting.`,
          link: '/integrations/',
          dedupeKey: 'catalog-sync-held',
        },
        this.now(),
      );
      return held;
    }

    await this.#apply(runId, diff, parsed.products);
    const done = await this.db.productSyncRun.update({
      where: { id: runId },
      data: {
        status: opts.force ? 'APPLIED_AFTER_HOLD' : 'SUCCEEDED',
        finishedAt: this.now(),
        sourceUpdatedAt,
        report,
        ...counts,
      },
    });
    await resolveNotification(this.db, 'catalog-sync-held', this.now());
    const newShopPrices = diff.wholesaleChanges.length;
    if (counts.priceChangeCount > 0 || counts.createdCount > 0 || newShopPrices > 0) {
      await notify(
        this.db,
        {
          kind: 'catalog.prices_to_confirm',
          severity: 'INFO',
          title: 'Yangi narxlarni tasdiqlang',
          body: `${counts.createdCount} ta yangi mahsulot, ${counts.priceChangeCount} ta narx o'zgarishi, saytdan ${newShopPrices} ta ulgurji (do'kon) narx. Agentlar faqat tasdiqlangan narxlarni ishlatadi.`,
          link: '/catalog/',
          dedupeKey: 'catalog-prices-to-confirm',
        },
        this.now(),
      );
    }
    if (opts.force) {
      await writeAudit(this.db, {
        actor: opts.actorUserId ? { type: 'user', id: opts.actorUserId } : { type: 'system' },
        action: 'catalog.held_sync_applied',
        entityType: 'product_sync_run',
        entityId: runId,
      });
    }
    return done;
  }

  async #existing(): Promise<ExistingProduct[]> {
    const rows = await this.db.product.findMany({
      where: { source: 'FIRESTORE' },
      include: {
        prices: { where: { priceType: 'RETAIL', validTo: null, status: { not: 'SUPERSEDED' } } },
      },
    });
    // Latest shop price that came from the website (current or superseded), per product.
    const site = await this.db.productPrice.findMany({
      where: { productId: { in: rows.map((r) => r.id) }, priceType: 'WHOLESALE', source: 'FIRESTORE' },
      orderBy: { validFrom: 'asc' },
      select: { productId: true, amount: true },
    });
    const lastSite = new Map(site.map((s) => [s.productId, s.amount]));
    return rows.map((p) => ({
      id: p.id,
      externalId: p.externalId ?? '',
      name: p.name,
      description: p.description,
      categoryName: p.categoryName,
      packageWeightGrams: p.packageWeightGrams,
      unitType: p.unitType,
      stockReported: p.stockReported,
      hasSourceImage: p.hasSourceImage,
      isActive: p.isActive,
      currentRetailSom: p.prices[0]?.amount ?? null,
      lastSiteWholesaleSom: lastSite.get(p.id) ?? null,
    }));
  }

  async #apply(runId: string, diff: CatalogDiff, incoming: { externalId: string }[]): Promise<void> {
    const now = this.now();
    await this.db.$transaction(
      async (tx) => {
        const idByExternal = new Map<string, string>();
        for (const p of diff.create) {
          const created = await tx.product.create({
            data: {
              source: 'FIRESTORE',
              externalId: p.externalId,
              name: p.name,
              description: p.description,
              categoryName: p.categoryName,
              packageWeightGrams: p.packageWeightGrams,
              unitType: p.unitType,
              stockReported: p.stockReported,
              availability: availabilityFor(p.stockReported),
              hasSourceImage: p.hasSourceImage,
              lastSyncedAt: now,
            },
          });
          idByExternal.set(p.externalId, created.id);
        }
        for (const u of diff.update) {
          const p = u.next;
          await tx.product.update({
            where: { id: u.id },
            data: {
              name: p.name,
              description: p.description,
              categoryName: p.categoryName,
              packageWeightGrams: p.packageWeightGrams,
              unitType: p.unitType,
              stockReported: p.stockReported,
              availability: availabilityFor(p.stockReported),
              hasSourceImage: p.hasSourceImage,
            },
          });
        }
        if (diff.reactivate.length) {
          await tx.product.updateMany({
            where: { id: { in: diff.reactivate } },
            data: { isActive: true, deactivatedAt: null },
          });
        }
        for (const c of diff.priceChanges) {
          const productId = c.id ?? idByExternal.get(c.externalId);
          if (!productId) continue;
          await tx.productPrice.updateMany({
            where: { productId, priceType: 'RETAIL', validTo: null },
            data: { status: 'SUPERSEDED', validTo: now },
          });
          await tx.productPrice.create({
            data: {
              productId,
              priceType: 'RETAIL',
              amount: c.to,
              source: 'FIRESTORE',
              status: 'OWNER_UNCONFIRMED',
              validFrom: now,
              syncRunId: runId,
            },
          });
        }
        // Website shop price -> WHOLESALE price version, unconfirmed until the owner confirms (D-019).
        for (const c of diff.wholesaleChanges) {
          const productId = c.id ?? idByExternal.get(c.externalId);
          if (!productId) continue;
          await tx.productPrice.updateMany({
            where: { productId, priceType: 'WHOLESALE', validTo: null },
            data: { status: 'SUPERSEDED', validTo: now },
          });
          await tx.productPrice.create({
            data: {
              productId,
              priceType: 'WHOLESALE',
              amount: c.to,
              source: 'FIRESTORE',
              status: 'OWNER_UNCONFIRMED',
              validFrom: now,
              syncRunId: runId,
            },
          });
        }
        if (diff.deactivate.length) {
          await tx.product.updateMany({
            where: { id: { in: diff.deactivate.map((d) => d.id) } },
            data: { isActive: false, deactivatedAt: now },
          });
        }
        await tx.product.updateMany({
          where: { source: 'FIRESTORE', externalId: { in: incoming.map((p) => p.externalId) } },
          data: { lastSyncedAt: now },
        });
        await this.#supersedeSeed(tx as unknown as Db, now);
      },
      { timeout: 60_000 },
    );
  }

  /** The website takes precedence: a seed product matching a live product by name + weight is retired. */
  async #supersedeSeed(tx: Db, now: Date): Promise<void> {
    const seeds = await tx.product.findMany({ where: { source: 'SEED', isActive: true } });
    if (!seeds.length) return;
    const live = await tx.product.findMany({ where: { source: 'FIRESTORE', isActive: true } });
    const key = (p: { name: string; packageWeightGrams: number | null }) =>
      `${normalizeProductName(p.name)}|${p.packageWeightGrams ?? ''}`;
    const liveByKey = new Map(live.map((p) => [key(p), p.id]));
    for (const s of seeds) {
      const match = liveByKey.get(key(s));
      if (match) {
        await tx.product.update({
          where: { id: s.id },
          data: { isActive: false, deactivatedAt: now, supersededById: match },
        });
      }
    }
  }
}
