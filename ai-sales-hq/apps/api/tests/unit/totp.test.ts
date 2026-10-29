import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  totpAt,
  verifyTotp,
} from '../../src/domain/totp';

const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('TOTP (RFC 6238 Appendix B, SHA-1)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('time %i -> %s', (t, expected) => {
    expect(hotp(RFC_SECRET, Math.floor(t / 30), 8)).toBe(expected);
  });

  it('base32 round-trips', () => {
    const buf = Buffer.from('hello totp world');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    expect(base32Encode(RFC_SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('accepts ±1 step and refuses replays', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000;
    const code = totpAt(secret, now);
    const step = verifyTotp(secret, code, now, null);
    expect(step).toBe(Math.floor(now / 30));
    expect(verifyTotp(secret, code, now + 30, null)).toBe(step);
    expect(verifyTotp(secret, code, now + 90, null)).toBeNull();
    expect(verifyTotp(secret, code, now, step)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now, null)).toBeNull();
  });

  it('builds an otpauth URI', () => {
    const uri = otpauthUri('ABC', 'owner');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('secret=ABC');
  });
});
