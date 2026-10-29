import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config';

const base = {
  DATABASE_URL: 'mysql://u:p@localhost:3306/db',
  APP_ORIGIN: 'https://agent.unutilmastam.uz',
  APP_SECRET_KEY: 'k'.repeat(40),
};

describe('config', () => {
  it('applies defaults', () => {
    const c = loadConfig({ ...base });
    expect(c.PORT).toBe(3001);
    expect(c.TOTP_REQUIRED).toBe(false);
    expect(c.TRUST_PROXY).toBe(true);
  });

  it('requires TOTP in production by default', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).TOTP_REQUIRED).toBe(true);
  });

  it('rejects http origin and placeholder secret in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', APP_ORIGIN: 'http://x.uz' })).toThrow(ConfigError);
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', APP_SECRET_KEY: `change-me-${'x'.repeat(30)}` }),
    ).toThrow(/APP_SECRET_KEY/);
  });

  it('never echoes secret values in errors', () => {
    try {
      loadConfig({ ...base, DATABASE_URL: 'postgres://user:topsecret@h/db' });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).toContain('DATABASE_URL');
      expect(String(e)).not.toContain('topsecret');
    }
  });
});
