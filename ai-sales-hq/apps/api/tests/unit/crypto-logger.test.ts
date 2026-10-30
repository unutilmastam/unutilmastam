import { describe, expect, it } from 'vitest';
import { randomToken, SecretBox, safeEqual, sha256Hex } from '../../src/lib/crypto';
import { poolConfigFromUrl } from '../../src/lib/db';
import { redactText } from '../../src/lib/logger';
import { scrubDetails } from '../../src/modules/audit';

describe('SecretBox', () => {
  it('round-trips and is bound to key and purpose', () => {
    const box = new SecretBox('k'.repeat(40), 'totp-seed');
    const sealed = box.seal('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.open(sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => new SecretBox('k'.repeat(40), 'other').open(sealed)).toThrow();
    expect(() => new SecretBox('j'.repeat(40), 'totp-seed').open(sealed)).toThrow();
  });

  it('uses fresh IVs', () => {
    const box = new SecretBox('k'.repeat(40), 'p');
    expect(box.seal('x')).not.toBe(box.seal('x'));
  });
});

describe('helpers', () => {
  it('tokens, hashes, comparisons', () => {
    expect(randomToken()).toHaveLength(43);
    expect(sha256Hex('a')).toHaveLength(64);
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
  });

  it('redacts secrets in free text', () => {
    const text = redactText(
      'url https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawq/x mysql://hq:pw123@localhost/db sk-abcdefghijklmnopqrstu',
    );
    expect(text).not.toContain('AAHdqTcv');
    expect(text).not.toContain('pw123');
    expect(text).not.toContain('abcdefghijklmnop');
  });

  it('scrubs credential-like audit details', () => {
    expect(scrubDetails({ username: 'a', password: 'x', setupToken: 'y' })).toEqual({
      username: 'a',
      password: '[REDACTED]',
      setupToken: '[REDACTED]',
    });
  });

  it('parses database URLs including socket path', () => {
    const c = poolConfigFromUrl('mysql://u%40x:p%3Aw@localhost:3307/hq?socketPath=/var/lib/mysql/mysql.sock');
    expect(c).toMatchObject({
      user: 'u@x',
      password: 'p:w',
      port: 3307,
      database: 'hq',
      socketPath: '/var/lib/mysql/mysql.sock',
    });
  });
});
