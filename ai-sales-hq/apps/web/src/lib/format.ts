/** 25000 -> "25 000 so'm" (integer so'm only). */
export function som(amount: number): string {
  return `${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;
}

const dtf = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Tashkent',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Business time zone is always Asia/Tashkent (SPEC_AMENDMENTS A8). */
export function when(iso: string | null | undefined, fallback = '—'): string {
  return iso ? dtf.format(new Date(iso)) : fallback;
}

export function grams(g: number | null): string {
  if (!g) return '';
  return g >= 1000 && g % 1000 === 0 ? `${g / 1000} kg` : `${g} g`;
}

/** Short money for tiles: 420 000 -> "420 ming so'm", 1 250 000 -> "1,25 mln so'm" (display only). */
export function somShort(amount: number): string {
  const n = Math.round(amount);
  const fmt = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }).replace(/\u00a0/g, ' ');
  if (Math.abs(n) >= 1_000_000_000) return `${fmt(n / 1_000_000_000)} mlrd so'm`;
  if (Math.abs(n) >= 1_000_000) return `${fmt(n / 1_000_000)} mln so'm`;
  if (Math.abs(n) >= 100_000) return `${fmt(Math.round(n / 1000))} ming so'm`;
  return som(n);
}

const MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];
const DAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

/** "Payshanba, 30-oktabr" in Tashkent time (Uzbek names; browsers lack uz-Latn month data). */
export function todayUz(at = new Date()): string {
  const local = new Date(at.getTime() + 5 * 3600_000); // Asia/Tashkent is UTC+5, no DST
  const day = DAYS[local.getUTCDay()] ?? '';
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${local.getUTCDate()}-${MONTHS[local.getUTCMonth()]}`;
}
