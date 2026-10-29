import { describe, expect, it } from 'vitest';
import { grams, som, when } from '@/lib/format';

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
});
