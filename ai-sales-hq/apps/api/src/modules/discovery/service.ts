import { z } from 'zod';
import { CSV_COLUMNS, type CsvColumn, mapHeader, parseCsv } from '../../domain/csv';
import { parseStores } from '../../domain/firestore-stores';
import {
  CATEGORIES,
  type Category,
  DEFAULT_QUALIFY_THRESHOLD,
  detectDistrict,
  normalizeBusinessName,
  normalizePhone,
  SURXONDARYO_DISTRICTS,
} from '../../domain/prospects';
import { toTashkent } from '../../domain/schedule';
import type { CatalogSource } from '../../integrations/firestore';
import type { PlaceResult, PlacesClient } from '../../integrations/places';
import type { Db } from '../../lib/db';
import { AppError, badRequest } from '../../lib/errors';
import { type Actor, writeAudit } from '../audit';
import { markIntegration } from '../integrations/service';
import type { IngestResult, ProspectService } from '../prospects/service';

export const INTEGRATION_PLACES = 'google_places';
const SETTINGS_KEY = 'discovery';
// Google Places API (New) Text Search Pro, list price per request (USD), for the budget view.
const PLACES_MICRO_USD_PER_REQUEST = 32_000n;
// Places content other than place_id may be cached at most 30 days (Google Maps Platform terms).
const PLACES_CACHE_DAYS = 30;
const MAX_CSV_ROWS = 2000;

export const discoverySettingsSchema = z.object({
  placesDailyLimit: z.number().int().min(0).max(1000),
  queries: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
  districts: z.array(z.string()).min(1).max(SURXONDARYO_DISTRICTS.length),
  matchByNameAndDistrict: z.boolean(),
  qualifyThreshold: z.number().int().min(0).max(100),
});
export type DiscoverySettings = z.infer<typeof discoverySettingsSchema>;

export const DEFAULT_DISCOVERY: DiscoverySettings = {
  placesDailyLimit: 50,
  queries: ['supermarket', 'minimarket', 'oziq-ovqat do‘koni', 'ulgurji oziq-ovqat'],
  districts: SURXONDARYO_DISTRICTS.map((d) => d.name),
  matchByNameAndDistrict: true,
  qualifyThreshold: DEFAULT_QUALIFY_THRESHOLD,
};

export async function loadDiscoverySettings(db: Db): Promise<DiscoverySettings> {
  const row = await db.systemSetting.findUnique({ where: { key: SETTINGS_KEY } });
  const parsed = discoverySettingsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_DISCOVERY;
}

/** Matching/threshold settings in the shape ProspectService expects. */
export function matchSettingsFrom(db: Db) {
  return async () => {
    const s = await loadDiscoverySettings(db);
    return { matchByNameAndDistrict: s.matchByNameAndDistrict, qualifyThreshold: s.qualifyThreshold };
  };
}

export interface CsvPreviewRow {
  line: number;
  status: 'ok' | 'invalid' | 'duplicate_in_file' | 'exists';
  reason: string | null;
  name: string;
  phone: string | null;
  district: string | null;
}

export class DiscoveryService {
  constructor(
    private readonly db: Db,
    private readonly prospects: ProspectService,
    private readonly getFirestore: () => CatalogSource | null,
    private readonly places: PlacesClient | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  settings(): Promise<DiscoverySettings> {
    return loadDiscoverySettings(this.db);
  }

  async saveSettings(s: DiscoverySettings, actorUserId: string) {
    const known = new Set(SURXONDARYO_DISTRICTS.map((d) => d.name));
    if (s.districts.some((d) => !known.has(d))) throw badRequest('invalid_district', "Noma'lum tuman");
    await this.db.systemSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value: s, updatedById: actorUserId },
      update: { value: s, updatedById: actorUserId },
    });
    await writeAudit(this.db, { actor: { type: 'user', id: actorUserId }, action: 'discovery.settings', details: s });
  }

  // ---------- usage / budget ----------

  #day(): string {
    return toTashkent(this.now()).date;
  }

  async placesUsedToday(): Promise<number> {
    const row = await this.db.providerUsage.findUnique({
      where: { provider_day: { provider: 'google_places', day: this.#day() } },
    });
    return row?.requests ?? 0;
  }

  async #countPlacesRequest(): Promise<void> {
    const day = this.#day();
    await this.db.providerUsage.upsert({
      where: { provider_day: { provider: 'google_places', day } },
      create: { provider: 'google_places', day, requests: 1, estimatedMicroUsd: PLACES_MICRO_USD_PER_REQUEST },
      update: { requests: { increment: 1 }, estimatedMicroUsd: { increment: PLACES_MICRO_USD_PER_REQUEST } },
    });
  }

  async status() {
    const s = await this.settings();
    const [used, firestore, places, bySource, byStage] = await Promise.all([
      this.placesUsedToday(),
      this.db.integration.findUnique({ where: { key: 'firestore' } }),
      this.db.integration.findUnique({ where: { key: INTEGRATION_PLACES } }),
      this.db.prospectSource.groupBy({ by: ['sourceType'], _count: { _all: true } }),
      this.db.prospect.groupBy({ by: ['stage'], _count: { _all: true } }),
    ]);
    return {
      settings: s,
      firestore: { configured: !!this.getFirestore(), status: firestore?.status ?? 'NOT_CONFIGURED' },
      places: {
        configured: !!this.places,
        status: !this.places ? 'NOT_CONFIGURED' : (places?.status ?? 'CONFIGURED'),
        lastError: places?.lastError ?? null,
        usedToday: used,
        dailyLimit: s.placesDailyLimit,
      },
      sources: Object.fromEntries(bySource.map((r) => [r.sourceType, r._count._all])),
      stages: Object.fromEntries(byStage.map((r) => [r.stage, r._count._all])),
      districts: SURXONDARYO_DISTRICTS.map((d) => d.name),
      categories: CATEGORIES,
    };
  }

  // ---------- source 1: existing store list (Firestore) ----------

  async importFirestoreStores(actor: Actor) {
    const source = this.getFirestore();
    if (!source) throw new AppError(409, 'not_configured', 'Firestore integratsiyasi sozlanmagan');
    const snap = await source.fetchStoreList();
    const stores = parseStores(snap.stores.value, snap.users.value, snap.orders.value);
    const tally = { created: 0, merged: 0, skipped: 0 };
    for (const s of stores) {
      const r = await this.prospects.ingest(
        {
          name: s.name,
          address: s.address,
          contactPersonName: s.ownerName,
          lat: s.lat,
          lng: s.lng,
          phones: [s.phone],
          isExistingCustomer: s.orderCount > 0,
          sourceType: 'FIRESTORE_STORE',
          externalId: s.externalId,
          evidence: { orderCount: s.orderCount, lastOrderDate: s.lastOrderDate },
        },
        actor,
      );
      tally[r.action]++;
    }
    return { found: stores.length, ...tally };
  }

  // ---------- source 2: manual entry and CSV ----------

  async addManual(
    input: {
      name: string;
      phone?: string;
      telegram?: string;
      address?: string;
      district?: string;
      category?: Category;
      notes?: string;
    },
    actor: Actor,
  ): Promise<IngestResult> {
    if (input.phone && !normalizePhone(input.phone)) throw badRequest('invalid_phone', "Telefon raqami noto'g'ri");
    return this.prospects.ingest(
      {
        name: input.name,
        phones: [input.phone],
        telegram: input.telegram,
        address: input.address ?? null,
        district: input.district ?? null,
        category: input.category ?? null,
        notes: input.notes ?? null,
        sourceType: 'MANUAL',
      },
      actor,
    );
  }

  #csvRows(text: string) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw badRequest('empty_csv', "Faylda sarlavha va kamida bitta qator bo'lishi kerak");
    if (rows.length - 1 > MAX_CSV_ROWS) throw badRequest('too_many_rows', `Ko'pi bilan ${MAX_CSV_ROWS} qator`);
    const map = mapHeader(rows[0] as string[]);
    if (map.name === undefined) throw badRequest('no_name_column', '"nomi" (name) ustuni topilmadi');
    const cell = (row: string[], col: CsvColumn) => {
      const idx = map[col];
      return idx === undefined ? '' : (row[idx] ?? '').trim();
    };
    return rows.slice(1).map((row, i) => ({
      line: i + 2,
      values: Object.fromEntries(CSV_COLUMNS.map((c) => [c, cell(row, c)])) as Record<CsvColumn, string>,
    }));
  }

  /** Dry run: nothing is written; every row is classified (MASTER_SPEC §10 dedup, A4). */
  async previewCsv(text: string): Promise<{ rows: CsvPreviewRow[]; counts: Record<CsvPreviewRow['status'], number> }> {
    const seen = new Set<string>();
    const out: CsvPreviewRow[] = [];
    for (const { line, values } of this.#csvRows(text)) {
      const phone = normalizePhone(values.phone);
      const district = detectDistrict(values.district) ?? detectDistrict(values.address);
      const base = { line, name: values.name, phone, district };
      if (values.name.length < 2) {
        out.push({ ...base, status: 'invalid', reason: 'nomi yo‘q' });
        continue;
      }
      if (values.phone && !phone) {
        out.push({ ...base, status: 'invalid', reason: "telefon noto'g'ri" });
        continue;
      }
      const key = phone ?? `${normalizeBusinessName(values.name)}|${district ?? ''}`;
      if (seen.has(key)) {
        out.push({ ...base, status: 'duplicate_in_file', reason: 'faylda takrorlangan' });
        continue;
      }
      seen.add(key);
      const exists = phone
        ? await this.db.contactPoint.findFirst({ where: { kind: 'PHONE', value: phone }, select: { id: true } })
        : district
          ? await this.db.prospect.findFirst({
              where: { district, normalizedName: normalizeBusinessName(values.name) },
              select: { id: true },
            })
          : null;
      out.push({
        ...base,
        status: exists ? 'exists' : 'ok',
        reason: exists ? "bazada bor — ma'lumot qo'shiladi" : null,
      });
    }
    const counts = { ok: 0, invalid: 0, duplicate_in_file: 0, exists: 0 };
    for (const r of out) counts[r.status]++;
    return { rows: out, counts };
  }

  async importCsv(text: string, actor: Actor) {
    const preview = await this.previewCsv(text);
    const rows = this.#csvRows(text);
    const accepted = new Set(preview.rows.filter((r) => r.status === 'ok' || r.status === 'exists').map((r) => r.line));
    const tally = { created: 0, merged: 0, skipped: 0, rejected: preview.rows.length - accepted.size };
    for (const { line, values } of rows) {
      if (!accepted.has(line)) continue;
      const category = (CATEGORIES as readonly string[]).includes(values.category.toUpperCase())
        ? (values.category.toUpperCase() as Category)
        : null;
      const r = await this.prospects.ingest(
        {
          name: values.name,
          phones: [values.phone],
          telegram: values.telegram || null,
          address: values.address || null,
          district: values.district || null,
          category,
          notes: values.notes || null,
          sourceType: 'CSV',
          evidence: { line },
        },
        actor,
      );
      tally[r.action]++;
    }
    await writeAudit(this.db, { actor, action: 'prospects.csv_import', details: tally });
    return tally;
  }

  // ---------- source 3: Google Places (official API, budget-capped) ----------

  async searchPlaces(query: string, district: string, actor: Actor) {
    if (!this.places) throw new AppError(409, 'not_configured', 'Google Places kaliti sozlanmagan');
    const s = await this.settings();
    const used = await this.placesUsedToday();
    if (used >= s.placesDailyLimit) {
      throw new AppError(429, 'budget_exceeded', `Bugungi Google Places limiti tugadi (${used}/${s.placesDailyLimit})`);
    }
    await this.#countPlacesRequest();
    let found: PlaceResult[];
    try {
      found = (await this.places.searchText(`${query} ${district} Surxondaryo`)).places;
      await markIntegration(this.db, INTEGRATION_PLACES, { ok: true, at: this.now() });
    } catch (err) {
      await markIntegration(this.db, INTEGRATION_PLACES, { ok: false, error: (err as Error).message, at: this.now() });
      throw err;
    }
    const tally = { found: found.length, created: 0, merged: 0, skipped: 0 };
    const expiresAt = new Date(this.now().getTime() + PLACES_CACHE_DAYS * 86_400_000);
    for (const p of found) {
      const r = await this.prospects.ingest(this.#fromPlace(p, district, expiresAt), actor);
      tally[r.action]++;
    }
    return tally;
  }

  #fromPlace(p: PlaceResult, district: string, expiresAt: Date) {
    return {
      name: p.name,
      placeTypes: p.types,
      address: p.address,
      district: detectDistrict(p.address) ?? district,
      lat: p.lat,
      lng: p.lng,
      phones: [p.phone],
      placeId: p.placeId,
      rating: p.rating,
      ratingCount: p.ratingCount,
      sourceType: 'GOOGLE_PLACES' as const,
      externalId: p.placeId,
      sourceUrl: p.mapsUrl,
      evidence: { types: p.types, query: district },
      expiresAt,
    };
  }

  /**
   * Google terms: content other than place_id may be cached for a limited time. Expired Places
   * data is refreshed (when the key and budget allow) or removed, keeping only place_id.
   */
  async refreshExpiredPlaces(actor: Actor, limit = 10) {
    const expired = await this.db.prospectSource.findMany({
      where: { sourceType: 'GOOGLE_PLACES', expiresAt: { lt: this.now() } },
      take: limit,
    });
    const s = await this.settings();
    const tally = { refreshed: 0, redacted: 0 };
    for (const src of expired) {
      const canRefresh = !!this.places && src.externalId && (await this.placesUsedToday()) < s.placesDailyLimit;
      if (canRefresh && this.places && src.externalId) {
        await this.#countPlacesRequest();
        const fresh = await this.places.details(src.externalId).catch(() => null);
        if (fresh) {
          const prospect = await this.db.prospect.findUniqueOrThrow({ where: { id: src.prospectId } });
          await this.prospects.ingest(
            this.#fromPlace(
              fresh,
              prospect.district ?? '',
              new Date(this.now().getTime() + PLACES_CACHE_DAYS * 86_400_000),
            ),
            actor,
          );
          tally.refreshed++;
          continue;
        }
      }
      await this.db.$transaction(async (tx) => {
        await tx.prospectSource.update({
          where: { id: src.id },
          data: { evidence: { redacted: true }, expiresAt: null },
        });
        await tx.contactPoint.deleteMany({
          where: { prospectId: src.prospectId, sourceType: 'GOOGLE_PLACES', isVerified: false },
        });
        const others = await tx.prospectSource.count({
          where: { prospectId: src.prospectId, sourceType: { not: 'GOOGLE_PLACES' } },
        });
        if (others === 0) {
          await tx.prospect.update({
            where: { id: src.prospectId },
            data: { rating: null, ratingCount: null, address: null },
          });
        }
      });
      tally.redacted++;
    }
    return tally;
  }

  /** Next (query, district) pair for the automatic search, rotating through the settings. */
  async nextSearch(): Promise<{ query: string; district: string; cursor: number }> {
    const s = await this.settings();
    const row = await this.db.systemSetting.findUnique({ where: { key: 'discovery.cursor' } });
    const cursor = typeof row?.value === 'number' ? row.value : 0;
    const total = s.queries.length * s.districts.length;
    const i = cursor % total;
    return {
      query: s.queries[i % s.queries.length] as string,
      district: s.districts[Math.floor(i / s.queries.length)] as string,
      cursor,
    };
  }

  async advanceCursor(cursor: number) {
    await this.db.systemSetting.upsert({
      where: { key: 'discovery.cursor' },
      create: { key: 'discovery.cursor', value: cursor + 1 },
      update: { value: cursor + 1 },
    });
  }
}
