// Prospect data quality (MASTER_SPEC §10, SPEC_AMENDMENTS A4/A10). Pure functions, unit-tested.

// ---------- Pipeline (A10) ----------

export const PROSPECT_STAGES = [
  'NEW',
  'NEEDS_VERIFICATION',
  'QUALIFIED',
  'CONTACT_PENDING',
  'CONTACTED',
  'INTERESTED',
  'NEGOTIATION',
  'WON',
  'LOST',
  'DO_NOT_CONTACT',
] as const;
export type ProspectStage = (typeof PROSPECT_STAGES)[number];

const FLOW: Record<ProspectStage, readonly ProspectStage[]> = {
  NEW: ['NEEDS_VERIFICATION', 'QUALIFIED', 'LOST'],
  NEEDS_VERIFICATION: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['CONTACT_PENDING', 'NEEDS_VERIFICATION', 'LOST'],
  CONTACT_PENDING: ['CONTACTED', 'QUALIFIED', 'LOST'],
  CONTACTED: ['INTERESTED', 'CONTACT_PENDING', 'LOST'],
  INTERESTED: ['NEGOTIATION', 'WON', 'LOST'],
  NEGOTIATION: ['WON', 'LOST', 'INTERESTED'],
  WON: [],
  LOST: ['NEW'],
  DO_NOT_CONTACT: [],
};

/** DO_NOT_CONTACT is reachable from every stage and is final (opt-out wins, MASTER_SPEC §11). */
export function canMoveProspect(from: ProspectStage, to: ProspectStage): boolean {
  if (to === 'DO_NOT_CONTACT') return from !== 'DO_NOT_CONTACT';
  return FLOW[from].includes(to);
}

// ---------- Region (A4 default filter) ----------

export const SURXONDARYO_DISTRICTS: readonly { name: string; aliases: readonly string[] }[] = [
  { name: 'Termiz', aliases: ['termiz', 'termez', 'термез', 'термиз'] },
  { name: 'Denov', aliases: ['denov', 'denau', 'денау', 'денов'] },
  { name: "Sho'rchi", aliases: ["sho'rchi", 'shorchi', 'shurchi', 'шурчи', 'шўрчи'] },
  { name: 'Sherobod', aliases: ['sherobod', 'sherabad', 'шерабад', 'шеробод'] },
  { name: "Jarqo'rg'on", aliases: ["jarqo'rg'on", 'jarqorgon', 'jarkurgan', 'джаркурган', 'жарқўрғон'] },
  { name: "Qumqo'rg'on", aliases: ["qumqo'rg'on", 'qumqorgon', 'kumkurgan', 'кумкурган', 'қумқўрғон'] },
  { name: 'Boysun', aliases: ['boysun', 'baysun', 'байсун', 'бойсун'] },
  { name: 'Sariosiyo', aliases: ['sariosiyo', 'sariasiya', 'сариасия', 'сариосиё'] },
  { name: 'Uzun', aliases: ['uzun', 'узун'] },
  { name: 'Angor', aliases: ['angor', 'ангор'] },
  { name: 'Qiziriq', aliases: ['qiziriq', 'kizirik', 'кизирик', 'қизириқ'] },
  { name: 'Muzrabot', aliases: ['muzrabot', 'muzrabad', 'музрабад', 'музработ'] },
  { name: 'Oltinsoy', aliases: ['oltinsoy', 'altynsay', 'алтынсай', 'олтинсой'] },
  { name: 'Bandixon', aliases: ['bandixon', 'bandikhon', 'бандихон'] },
];

function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/\s+/g, ' ');
}

/** Finds a Surxondaryo district mentioned in free text (address, city field). */
export function detectDistrict(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = fold(text);
  for (const d of SURXONDARYO_DISTRICTS) {
    if (d.aliases.some((a) => new RegExp(`(^|[^\\p{L}])${a.replace(/'/g, "'?")}`, 'u').test(t))) return d.name;
  }
  return null;
}

/** Rough Surxondaryo bounding box (lat 37.1–38.9, lng 66.5–68.6). */
export function inSurxondaryo(lat: number, lng: number): boolean {
  return lat >= 37.1 && lat <= 38.9 && lng >= 66.5 && lng <= 68.6;
}

/**
 * The PWA stores a random point around Tashkent (41.3111±0.04, 69.2797±0.04) when no location was
 * picked (PROJECT_AUDIT §2.3). Such points are fake and must not be used.
 */
export function isPwaFallbackLocation(lat: number, lng: number): boolean {
  return Math.abs(lat - 41.3111) <= 0.0401 && Math.abs(lng - 69.2797) <= 0.0401;
}

// ---------- Phones ----------

// 9 national digits; operator/area codes change too often to hard-code, so only the shape is checked.

/** Uzbek numbers to E.164 (+998 + 9 digits); null when it cannot be a valid Uzbek number. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length === 12) digits = digits.slice(3);
  else if (digits.startsWith('8') && digits.length === 10) digits = digits.slice(1); // old 8-xx format
  if (!/^[2-9]\d{8}$/.test(digits)) return null;
  return `+998${digits}`;
}

/** "+998 90 123-45-67" for display; masked variant for AI prompts (A6). */
export function formatPhone(e164: string, masked = false): string {
  const d = e164.replace(/^\+998/, '');
  const shown = `+998 ${d.slice(0, 2)} ${d.slice(2, 5)}-${d.slice(5, 7)}-${d.slice(7)}`;
  return masked ? `+998 ${d.slice(0, 2)} ***-**-${d.slice(7)}` : shown;
}

export function normalizeTelegram(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^(?:https?:\/\/)?(?:t\.me\/|@)?([A-Za-z][A-Za-z0-9_]{4,31})$/.exec(raw.trim());
  return m?.[1] ? m[1].toLowerCase() : null;
}

// ---------- Names / dedup keys ----------

const NAME_NOISE = /\b(ooo|mchj|xk|yatt|ип|ооо|chp|savdo|do'koni|dukoni|магазин|market)\b/gu;

export function normalizeBusinessName(name: string): string {
  return fold(name)
    .replace(/["«»“”]/g, ' ')
    .replace(NAME_NOISE, ' ')
    .replace(/[^\p{L}\p{N}' ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DedupInput {
  phones: string[];
  placeId: string | null;
  normalizedName: string;
  district: string | null;
}

export interface DedupCandidate extends DedupInput {
  id: string;
}

export interface MatchSettings {
  // Name + district equality is a weaker signal than a shared phone; the owner may switch it off.
  matchByNameAndDistrict: boolean;
}

export const DEFAULT_MATCH: MatchSettings = { matchByNameAndDistrict: true };

/** Returns the id of an existing prospect that is the same business, with the reason. */
export function findDuplicate(
  input: DedupInput,
  candidates: readonly DedupCandidate[],
  settings: MatchSettings = DEFAULT_MATCH,
): { id: string; reason: 'place_id' | 'phone' | 'name_district' } | null {
  if (input.placeId) {
    const hit = candidates.find((c) => c.placeId === input.placeId);
    if (hit) return { id: hit.id, reason: 'place_id' };
  }
  for (const phone of input.phones) {
    const hit = candidates.find((c) => c.phones.includes(phone));
    if (hit) return { id: hit.id, reason: 'phone' };
  }
  if (settings.matchByNameAndDistrict && input.district && input.normalizedName.length >= 3) {
    const hit = candidates.find((c) => c.district === input.district && c.normalizedName === input.normalizedName);
    if (hit) return { id: hit.id, reason: 'name_district' };
  }
  return null;
}

// ---------- Categories and scoring (Business Analyst, MASTER_SPEC §9C) ----------

export const CATEGORIES = ['SUPERMARKET', 'MINIMARKET', 'GROCERY', 'WHOLESALE', 'FOOD_RETAIL', 'OTHER'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Maps Google place types / free text to our categories. */
export function categorize(types: readonly string[], name = ''): Category {
  const t = new Set(types);
  const n = fold(name);
  if (t.has('wholesaler') || /optom|ulgurji|оптов|wholesale|distrib/.test(n)) return 'WHOLESALE';
  if (t.has('supermarket') || t.has('hypermarket') || /supermarket|супермаркет|гипермаркет/.test(n))
    return 'SUPERMARKET';
  if (t.has('convenience_store') || /mini ?market|минимаркет/.test(n)) return 'MINIMARKET';
  if (t.has('grocery_store') || t.has('food_store') || /oziq|продукт|grocery|do'kon|dokon|магазин|\bmarket\b/.test(n))
    return 'GROCERY';
  if (t.has('butcher_shop') || t.has('market') || t.has('store')) return 'FOOD_RETAIL';
  return 'OTHER';
}

export interface ScoreInput {
  category: Category;
  district: string | null;
  hasPhone: boolean;
  hasVerifiedContact: boolean;
  isExistingCustomer: boolean;
  rating: number | null;
  ratingCount: number | null;
  locationKnown: boolean;
}

export interface ScoreResult {
  score: number; // 0..100
  reasons: { points: number; text: string }[];
}

const CATEGORY_POINTS: Record<Category, [number, string]> = {
  SUPERMARKET: [30, 'Supermarket: muzlatilgan mahsulot javoni bo‘lishi ehtimoli yuqori'],
  WHOLESALE: [30, 'Ulgurji savdo: katta hajmda olishi mumkin'],
  MINIMARKET: [24, 'Minimarket: kundalik oziq-ovqat sotadi'],
  GROCERY: [20, 'Oziq-ovqat do‘koni'],
  FOOD_RETAIL: [12, 'Oziq-ovqat bilan bog‘liq savdo nuqtasi'],
  OTHER: [0, 'Faoliyat turi aniq emas'],
};

/** Deterministic, explainable score (MASTER_SPEC §10: evidence, no fabricated assumptions). */
export function scoreProspect(i: ScoreInput): ScoreResult {
  const reasons: { points: number; text: string }[] = [];
  const add = (points: number, text: string) => reasons.push({ points, text });
  const [cp, ct] = CATEGORY_POINTS[i.category];
  add(cp, ct);
  if (i.district) add(15, `Surxondaryo, ${i.district} — yetkazib berish hududida`);
  else add(0, 'Tuman aniqlanmagan — manzilni tekshirish kerak');
  if (i.hasVerifiedContact) add(20, 'Tasdiqlangan aloqa mavjud');
  else if (i.hasPhone) add(10, 'Telefon bor, lekin tasdiqlanmagan');
  else add(0, "Aloqa ma'lumoti yo'q");
  if (i.isExistingCustomer) add(20, 'Avval buyurtma bergan mijoz');
  if (i.rating !== null && i.ratingCount !== null && i.ratingCount >= 5) {
    const pts = Math.round(Math.max(0, Math.min(10, (i.rating - 3) * 5)));
    add(pts, `Google reytingi ${i.rating.toFixed(1)} (${i.ratingCount} ta baho)`);
  }
  if (!i.locationKnown) add(-5, 'Joylashuv noma’lum');
  const score = Math.max(
    0,
    Math.min(
      100,
      reasons.reduce((s, r) => s + r.points, 0),
    ),
  );
  return { score, reasons };
}

export const DEFAULT_QUALIFY_THRESHOLD = 45;

/** After scoring: unverified contacts go to the review queue; strong, verified ones are qualified. */
export function stageAfterScoring(
  current: ProspectStage,
  score: number,
  hasVerifiedContact: boolean,
  threshold = DEFAULT_QUALIFY_THRESHOLD,
): ProspectStage {
  if (current !== 'NEW' && current !== 'NEEDS_VERIFICATION') return current;
  if (hasVerifiedContact && score >= threshold) return 'QUALIFIED';
  return 'NEEDS_VERIFICATION';
}
