// Sales workflow rules (MASTER_SPEC §11/§13, SPEC_AMENDMENTS A5/A6). Pure and unit-tested.
// The AI may phrase a message; these deterministic checks decide whether it can be used.

import type { Category } from './prospects';

export interface CatalogItem {
  name: string;
  grams: number | null;
  retailSom: number | null; // confirmed retail price, or null when not confirmed
  wholesaleSom: number | null; // confirmed wholesale price, or null
}

const LIMIT_BY_CATEGORY: Record<Category, number> = {
  SUPERMARKET: 12,
  WHOLESALE: 12,
  MINIMARKET: 6,
  GROCERY: 6,
  FOOD_RETAIL: 4,
  OTHER: 4,
};

/** Sales Manager: which products to offer. Only items with a confirmed retail price are offered. */
export function recommendProducts(category: Category, catalog: readonly CatalogItem[]): CatalogItem[] {
  return catalog
    .filter((p) => p.retailSom !== null)
    .sort((a, b) => (a.retailSom as number) - (b.retailSom as number))
    .slice(0, LIMIT_BY_CATEGORY[category]);
}

export function formatSom(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;
}

export function productLine(p: CatalogItem): string {
  const weight = p.grams ? ` ${p.grams >= 1000 && p.grams % 1000 === 0 ? `${p.grams / 1000} kg` : `${p.grams} g`}` : '';
  const prices = [
    p.retailSom !== null ? `chakana ${formatSom(p.retailSom)}` : null,
    p.wholesaleSom !== null ? `ulgurji ${formatSom(p.wholesaleSom)}` : null,
  ].filter(Boolean);
  return `${p.name}${weight}${prices.length ? ` — ${prices.join(', ')}` : ''}`;
}

/** Deterministic first message: works with no AI provider at all (A5 assisted manual mode). */
export function templateOutreach(businessName: string, products: readonly CatalogItem[], signature: string): string {
  const lines = products.slice(0, 6).map((p) => `• ${productLine(p)}`);
  return [
    `Assalomu alaykum! "${businessName}" do'koniga murojaat qilyapmiz.`,
    `Biz — ${signature}, Surxondaryoda muzlatilgan milliy taomlar ishlab chiqaramiz.`,
    lines.length
      ? `Sizga quyidagilarni taklif qilamiz:\n${lines.join('\n')}`
      : "Mahsulotlarimiz ro'yxatini yuborishimiz mumkin.",
    "Mahsulotlarimizni sotuvga olishga qiziqsangiz, javob yozing yoki qo'ng'iroq qiling — batafsil gaplashamiz.",
    `Hurmat bilan, ${signature}`,
  ].join('\n\n');
}

/** Reply when the customer asks for special terms: the owner decides (MASTER_SPEC §13). */
export function templateEscalationReply(signature: string): string {
  return `Rahmat, savolingizni oldik. Narx va shartlar bo'yicha rahbarimiz o'zi siz bilan bog'lanadi.\n\nHurmat bilan, ${signature}`;
}

// ---------- Quality gate ----------

// A type alias (not an interface) so it is assignable to Prisma's JSON input type.
export type GateIssue = {
  code: 'empty' | 'too_long' | 'unknown_price' | 'discount' | 'promise' | 'link' | 'phone_number';
  detail: string;
};

const DISCOUNT = /chegirma|skidka|скидк|aksiya|акци|bepul|бесплатн|tekin|\d\s*%|foiz/iu;
const PROMISE =
  /kafolat|garant|гарант|ertaga yetkaz|bugun yetkaz|yetkazib berish bepul|eng arzon|самый дешев|muddatsiz|nasiyaga|в долг|kreditga/iu;
const LINK = /https?:\/\/|www\./iu;
const PHONE = /(?:\+?998[\s-]?)?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/u;

/** Numbers written as prices: "25 000 so'm", "25000 сум", "25.000". */
export function pricesIn(text: string): number[] {
  const out: number[] = [];
  // Weights and counts ("500 g", "1000 gramm", "10 ta") are not prices.
  const re = /(\d{1,3}(?:[ .,\u00a0]\d{3})+|\d{3,9})(?![\d.,]|\s*(?:g\b|gr|gramm|kg|ta\b|dona|шт|кг|г\b|гр))/giu;
  for (const m of text.matchAll(re)) {
    const n = Number((m[1] as string).replace(/[ ., ]/g, ''));
    if (n >= 500) out.push(n);
  }
  return out;
}

export function qualityGate(text: string, allowedPrices: ReadonlySet<number>, maxLength = 900): GateIssue[] {
  const issues: GateIssue[] = [];
  const body = text.trim();
  if (!body) return [{ code: 'empty', detail: "Xabar bo'sh" }];
  if (body.length > maxLength) issues.push({ code: 'too_long', detail: `Xabar juda uzun (${body.length} belgi)` });
  for (const p of pricesIn(body)) {
    if (!allowedPrices.has(p)) issues.push({ code: 'unknown_price', detail: `Tasdiqlanmagan narx: ${formatSom(p)}` });
  }
  if (DISCOUNT.test(body))
    issues.push({ code: 'discount', detail: 'Chegirma yoki bepul taklif — faqat egasi qaror qiladi' });
  if (PROMISE.test(body))
    issues.push({ code: 'promise', detail: "Va'da (yetkazish muddati, kafolat, nasiya) — faqat egasi qaror qiladi" });
  if (LINK.test(body)) issues.push({ code: 'link', detail: 'Xabarda havola bor' });
  // Phone numbers in a draft could be wrong or someone else's; the owner adds his own.
  const withoutPrices = body.replace(/(\d{1,3}(?:[ .,\u00a0]\d{3})+)\s*(?:so['‘’ʻ]?m|сум|sum)/giu, '');
  if (PHONE.test(withoutPrices)) issues.push({ code: 'phone_number', detail: 'Xabarda telefon raqami bor' });
  return issues;
}

// ---------- Inbound messages ----------

const NEEDS_OWNER =
  /narx|arzon|chegirma|skidka|скидк|цен|nasiya|qarz|в долг|konsign|optom|ulgurji|оптов|shart|условия|bonus|aksiya|yetkazib|доставк/iu;

/** Customer asks about price, discount, credit or delivery terms -> the owner must answer (§11). */
export function needsOwnerDecision(inbound: string): boolean {
  return NEEDS_OWNER.test(inbound);
}

/** Masks phone numbers and long digit runs before text is sent to an AI provider (A6). */
export function maskPersonalData(text: string): string {
  return text.replace(/\+?\d[\d\s()-]{7,}\d/g, '[raqam]');
}

// ---------- Contact frequency ----------

export function cooldownLeftDays(lastContactAt: Date | null, now: Date, cooldownDays: number): number {
  if (!lastContactAt) return 0;
  const left = cooldownDays - (now.getTime() - lastContactAt.getTime()) / 86_400_000;
  return left > 0 ? Math.ceil(left) : 0;
}

// ---------- AI cost ----------

/** List prices in USD per million tokens (Claude API, 2026-10). Unknown models count at Opus rates. */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

/** USD per million tokens equals micro-USD per token. */
export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): bigint {
  const p = MODEL_PRICES[model] ?? (MODEL_PRICES['claude-opus-5-5'] as { input: number; output: number });
  return BigInt(Math.ceil(inputTokens * p.input + outputTokens * p.output));
}
