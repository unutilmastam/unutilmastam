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
