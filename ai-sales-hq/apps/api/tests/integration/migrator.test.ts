import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as mariadb from 'mariadb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { poolConfigFromUrl } from '../../src/lib/db';
import { migrate, readMigrations } from '../../src/lib/migrator';
import { hasDb } from '../helpers';

// The hosting applies migrations with this runner instead of the Prisma CLI (D-020).
describe.skipIf(!hasDb)('migration runner (MySQL)', () => {
  const base = process.env.TEST_DATABASE_URL ?? '';
  const url = (db: string) => {
    const u = new URL(base);
    u.pathname = `/${db}`;
    return u.toString();
  };
  let admin: mariadb.Connection;
  const dir = resolve(__dirname, '..', '..', 'prisma', 'migrations');

  beforeAll(async () => {
    const { connectionLimit: _c, database: _d, ...cfg } = poolConfigFromUrl(base);
    admin = await mariadb.createConnection(cfg);
    for (const db of ['hq_mig_a', 'hq_mig_b']) {
      await admin.query(`DROP DATABASE IF EXISTS ${db}`);
      await admin.query(`CREATE DATABASE ${db} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    }
  });
  afterAll(async () => {
    for (const db of ['hq_mig_a', 'hq_mig_b']) await admin.query(`DROP DATABASE IF EXISTS ${db}`);
    await admin.end();
  });

  it('applies every migration once, with the same checksums Prisma writes', async () => {
    const all = readMigrations(dir);
    const first = await migrate(url('hq_mig_a'), dir);
    expect(first.applied).toEqual(all.map((m) => m.name));
    const again = await migrate(url('hq_mig_a'), dir);
    expect(again).toEqual({ applied: [], alreadyApplied: all.length, warnings: [] });

    const rows = await admin.query(
      'SELECT migration_name, checksum, applied_steps_count, finished_at FROM hq_mig_a._prisma_migrations ORDER BY migration_name',
    );
    expect(rows.map((r: any) => r.migration_name)).toEqual(all.map((m) => m.name));
    expect(rows.map((r: any) => r.checksum)).toEqual(all.map((m) => m.checksum));
    expect(rows.every((r: any) => r.finished_at !== null && Number(r.applied_steps_count) === 1)).toBe(true);
    // The test database was migrated by `prisma migrate deploy`: identical checksums.
    const prisma = await admin.query(
      `SELECT migration_name, checksum FROM \`${new URL(base).pathname.slice(1)}\`._prisma_migrations ORDER BY migration_name`,
    );
    expect(prisma.map((r: any) => r.checksum)).toEqual(all.map((m) => m.checksum));
    const tables = await admin.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'hq_mig_a' AND table_name IN ('orders','users','prospects')",
    );
    expect(Number(tables[0].n)).toBe(3);
  });

  it('records a failed migration and refuses to continue until it is resolved', async () => {
    const bad = mkdtempSync(join(tmpdir(), 'mig-'));
    mkdirSync(join(bad, '20260101000000_ok'));
    writeFileSync(join(bad, '20260101000000_ok', 'migration.sql'), 'CREATE TABLE t1 (id INT PRIMARY KEY);');
    mkdirSync(join(bad, '20260101000001_broken'));
    writeFileSync(join(bad, '20260101000001_broken', 'migration.sql'), 'CREATE TABLE t2 (id INT); THIS IS NOT SQL;');
    await expect(migrate(url('hq_mig_b'), bad)).rejects.toThrow(/20260101000001_broken failed/);
    const rows = await admin.query(
      'SELECT migration_name, finished_at, logs FROM hq_mig_b._prisma_migrations ORDER BY migration_name',
    );
    expect(rows.map((r: any) => [r.migration_name, r.finished_at === null])).toEqual([
      ['20260101000000_ok', false],
      ['20260101000001_broken', true],
    ]);
    expect(rows[1].logs).toBeTruthy();
    await expect(migrate(url('hq_mig_b'), bad)).rejects.toThrow(/failed earlier/);
  });
});
