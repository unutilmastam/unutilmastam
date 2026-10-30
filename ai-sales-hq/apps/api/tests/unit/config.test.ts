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

  it('builds DATABASE_URL from DB_* parts, encoding symbols in the password', () => {
    const { DATABASE_URL: _u, ...rest } = base;
    const c = loadConfig({ ...rest, DB_NAME: 'utam_hq', DB_USER: 'utam_hq', DB_PASSWORD: 'p@ss#w0rd&x/1' });
    expect(c.DATABASE_URL).toBe('mysql://utam_hq:p%40ss%23w0rd%26x%2F1@localhost:3306/utam_hq');
    const parsed = new URL(c.DATABASE_URL);
    expect(decodeURIComponent(parsed.password)).toBe('p@ss#w0rd&x/1');
    expect(() => loadConfig({ ...rest })).toThrow(/DB_NAME, DB_USER and DB_PASSWORD/);
    const viaSocket = loadConfig({
      ...rest,
      DB_NAME: 'd',
      DB_USER: 'u',
      DB_PASSWORD: 'p',
      DB_SOCKET: '/var/lib/mysql/mysql.sock',
    });
    expect(new URL(viaSocket.DATABASE_URL).searchParams.get('socketPath')).toBe('/var/lib/mysql/mysql.sock');
  });
});
