import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnvFile, settingsFileCandidates } from '../../src/lib/env-file';

describe('settings file lookup', () => {
  const saved = { ENV_FILE: process.env.ENV_FILE, HQ_TEST_VALUE: process.env.HQ_TEST_VALUE };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('prefers ENV_FILE, then apps/api/.env, then ~/ai-sales-hq-data/hq.env', () => {
    process.env.ENV_FILE = '/x/custom.env';
    const c = settingsFileCandidates('/app/apps/api');
    expect(c[0]).toBe('/x/custom.env');
    expect(c[1]).toBe('/app/apps/api/.env');
    expect(c[2]).toMatch(/ai-sales-hq-data\/hq\.env$/);
  });

  it('loads the first existing file without overriding variables already set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-'));
    writeFileSync(join(dir, '.env'), 'HQ_TEST_VALUE=from-file\nDB_PASSWORD="p@ss#w0rd"\n');
    delete process.env.ENV_FILE;
    process.env.HQ_TEST_VALUE = 'already-set';
    expect(loadEnvFile(dir)).toBe(join(dir, '.env'));
    expect(process.env.HQ_TEST_VALUE).toBe('already-set');
    expect(process.env.DB_PASSWORD).toBe('p@ss#w0rd');
    delete process.env.DB_PASSWORD;
  });
});
