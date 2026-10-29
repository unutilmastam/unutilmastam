// Pure catalog logic: parsing untrusted Firestore data, normalization and sync diffs.
// No I/O here; everything is unit-tested (docs/DECISIONS.md D-005, D-006).

export const MAX_PRICE_SOM = 100_000_000; // 100 mln so'm per package is clearly bogus
export const MAX_WEIGHT_GRAMS = 100_000;

export interface SourceProduct {
  externalId: string;
  name: string;
  description: string | null;
  categoryName: string | null;
  packageWeightGrams: number | null;
  unitType: string | null;
  priceSom: bigint;
  stockReported: number | null;
  hasSourceImage: boolean;
}

export interface InvalidRecord {
  index: number;
  externalId: string | null;
  reason: string;
}

export interface ParsedCatalog {
  products: SourceProduct[];
  invalid: InvalidRecord[];
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // Control characters become spaces; whitespace is collapsed.
  const visible = Array.from(value, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : ch;
  }).join('');
  const text = visible.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function wholeNumber(value: unknown, max: number): number | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) return 'invalid';
  return Number.isInteger(n) ? n : 'invalid';
}

/** Category documents: `[{id, name}]`. Invalid entries are skipped. */
export function parseCategories(json: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!json) return map;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return map;
  }
  if (!Array.isArray(data)) return map;
  for (const c of data) {
    if (c && typeof c === 'object' && typeof c.id === 'string') {
      const name = cleanText(c.name, 120);
      if (name) map.set(c.id, name);
    }
  }
  return map;
}

/**
 * Parses the PWA's `app/products` document value (a JSON array). Every field is validated:
 * the source is world-writable (PROJECT_AUDIT S1), so anything may arrive.
 */
export function parseProducts(json: string, categories: Map<string, string>): ParsedCatalog {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('products document is not valid JSON');
  }
  if (!Array.isArray(data)) throw new Error('products document is not an array');

  const products: SourceProduct[] = [];
  const invalid: InvalidRecord[] = [];
  const seen = new Set<string>();

  for (const [index, raw] of (data as unknown[]).entries()) {
    const reject = (reason: string, externalId: string | null = null) => {
      invalid.push({ index, externalId, reason });
    };
    if (!raw || typeof raw !== 'object') {
      reject('not an object');
      continue;
    }
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' && ID_RE.test(r.id) ? r.id : null;
    if (!id) {
      reject('missing or invalid id');
      continue;
    }
    if (seen.has(id)) {
      reject('duplicate id', id);
      continue;
    }
    const name = cleanText(r.name, 200);
    if (!name) {
      reject('missing name', id);
      continue;
    }
    const price = wholeNumber(r.price, MAX_PRICE_SOM);
    if (price === null || price === 'invalid') {
      reject('price must be a whole number of so‘m', id);
      continue;
    }
    const gram = wholeNumber(r.gram, MAX_WEIGHT_GRAMS);
    if (gram === 'invalid') {
      reject('invalid weight', id);
      continue;
    }
    const stock = wholeNumber(r.stock, 10_000_000);
    seen.add(id);
    products.push({
      externalId: id,
      name,
      description: cleanText(r.description, 2000),
      categoryName: typeof r.category === 'string' ? (categories.get(r.category) ?? null) : null,
      packageWeightGrams: gram === 0 ? null : gram,
      unitType: cleanText(r.unitType, 32),
      priceSom: BigInt(price),
      stockReported: stock === 'invalid' ? null : stock,
      // Images are base64 data URLs inside the document; we only record that one exists.
      hasSourceImage: typeof r.image === 'string' && r.image.startsWith('data:image/'),
    });
  }

  return { products, invalid };
}

/** "Lag'mon 1000 g" and "LAG‘MON" compare equal: case, apostrophe variants, punctuation. */
export function normalizeProductName(name: string): string {
  return name
    .toLocaleUpperCase('uz')
    .replace(/[‘’ʻʼ`´']/g, "'")
    .replace(/[^\p{L}\p{N}' ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ExistingProduct {
  id: string;
  externalId: string;
  name: string;
  description: string | null;
  categoryName: string | null;
  packageWeightGrams: number | null;
  unitType: string | null;
  stockReported: number | null;
  hasSourceImage: boolean;
  isActive: boolean;
  currentRetailSom: bigint | null;
}

export interface CatalogDiff {
  create: SourceProduct[];
  update: { id: string; next: SourceProduct; fields: string[] }[];
  priceChanges: { id: string | null; externalId: string; from: bigint | null; to: bigint }[];
  reactivate: string[];
  deactivate: { id: string; externalId: string; name: string }[];
}

const COMPARED_FIELDS = [
  'name',
  'description',
  'categoryName',
  'packageWeightGrams',
  'unitType',
  'stockReported',
  'hasSourceImage',
] as const;

export function diffCatalog(existing: ExistingProduct[], incoming: SourceProduct[]): CatalogDiff {
  const byExternal = new Map(existing.map((p) => [p.externalId, p]));
  const incomingIds = new Set(incoming.map((p) => p.externalId));
  const diff: CatalogDiff = { create: [], update: [], priceChanges: [], reactivate: [], deactivate: [] };

  for (const next of incoming) {
    const cur = byExternal.get(next.externalId);
    if (!cur) {
      diff.create.push(next);
      diff.priceChanges.push({ id: null, externalId: next.externalId, from: null, to: next.priceSom });
      continue;
    }
    const fields = COMPARED_FIELDS.filter((f) => cur[f] !== next[f]);
    if (fields.length) diff.update.push({ id: cur.id, next, fields });
    if (!cur.isActive) diff.reactivate.push(cur.id);
    if (cur.currentRetailSom !== next.priceSom) {
      diff.priceChanges.push({
        id: cur.id,
        externalId: next.externalId,
        from: cur.currentRetailSom,
        to: next.priceSom,
      });
    }
  }
  for (const cur of existing) {
    if (cur.isActive && !incomingIds.has(cur.externalId)) {
      diff.deactivate.push({ id: cur.id, externalId: cur.externalId, name: cur.name });
    }
  }
  return diff;
}

export interface GuardSettings {
  // Share of existing active products whose price changes or which disappear, above which the
  // sync is held for the owner. Default 0.3.
  maxChangeShare: number;
  // Below this many existing products the share check is skipped (a first import is all changes).
  minCatalogSize: number;
}

export const DEFAULT_GUARD: GuardSettings = { maxChangeShare: 0.3, minCatalogSize: 5 };

/** Returns a reason (Uzbek) when the diff looks like vandalism or a broken document. */
export function holdReason(existingActive: number, incomingCount: number, diff: CatalogDiff, g = DEFAULT_GUARD) {
  if (existingActive > 0 && incomingCount === 0) {
    return "Manbada birorta ham to'g'ri mahsulot yo'q — barcha mahsulotlar o'chib ketishi mumkin edi";
  }
  if (existingActive < g.minCatalogSize) return null;
  const changedPrices = diff.priceChanges.filter((c) => c.from !== null).length;
  const affected = changedPrices + diff.deactivate.length;
  if (affected / existingActive > g.maxChangeShare) {
    return `Bir vaqtda juda ko'p o'zgarish: ${changedPrices} ta narx va ${diff.deactivate.length} ta o'chirilgan mahsulot (${existingActive} tadan)`;
  }
  return null;
}

export function availabilityFor(stock: number | null): 'UNKNOWN' | 'UNVERIFIED' {
  // A stock counter typed into the PWA is not verified availability (MASTER_SPEC §4).
  return stock === null ? 'UNKNOWN' : 'UNVERIFIED';
}
