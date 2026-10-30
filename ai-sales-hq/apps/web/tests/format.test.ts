import { describe, expect, it } from 'vitest';
import { grams, som, somShort, todayUz, when } from '@/lib/format';

describe('format', () => {
  it('formats so‘m with thousands separators', () => {
    expect(som(25000)).toBe("25 000 so'm");
    expect(som(7500)).toBe("7 500 so'm");
    expect(som(1234567)).toBe("1 234 567 so'm");
  });
  it('formats weight', () => {
    expect(grams(1000)).toBe('1 kg');
    expect(grams(850)).toBe('850 g');
    expect(grams(null)).toBe('');
  });
  it('shows Tashkent time', () => {
    expect(when('2026-10-29T08:00:00Z')).toContain('13:00');
    expect(when(null)).toBe('—');
  });
  it('short money for tiles and Uzbek dates in Tashkent time', () => {
    expect(somShort(85000)).toBe("85 000 so'm");
    expect(somShort(420000)).toBe("420 ming so'm");
    expect(somShort(1250000)).toBe("1,25 mln so'm");
    expect(somShort(3_000_000_000)).toBe("3 mlrd so'm");
    // 2026-10-29 20:30 UTC is already Friday 30 October in Tashkent.
    expect(todayUz(new Date('2026-10-29T20:30:00Z'))).toBe('Juma, 30-oktabr');
  });
});
