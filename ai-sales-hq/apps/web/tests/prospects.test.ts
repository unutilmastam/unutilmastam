import { describe, expect, it } from 'vitest';
import { NEXT_STAGES, phone } from '@/lib/prospects';

describe('prospect helpers', () => {
  it('formats phones', () => {
    expect(phone('+998901234567')).toBe('+998 90 123-45-67');
    expect(phone('+7123')).toBe('+7123');
  });
  it('do-not-contact is final in the UI too', () => {
    expect(NEXT_STAGES.DO_NOT_CONTACT).toEqual([]);
  });
});
