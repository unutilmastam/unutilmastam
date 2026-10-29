import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as mariadb from 'mariadb';
import { poolConfigFromUrl } from './db-config';

// Applies prisma/migrations/*/migration.sql on the hosting without the Prisma CLI (its native
// schema engine may not match the server's OpenSSL). Writes the same `_prisma_migrations` rows as
// `prisma migrate deploy` (checksum = sha256 of the file), so both tools agree (D-020).

export interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

export function readMigrations(dir: string): Migration[] {
  if (!existsSync(dir)) throw new Error(`Migrations folder not found: ${dir}`);
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{14}_[a-z0-9_]+$/.test(d.name))
    .map((d) => d.name)
    .sort()
    .map((name) => {
      const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql, 'utf8').digest('hex') };
    });
}

const TABLE = `CREATE TABLE IF NOT EXISTS \`_prisma_migrations\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`checksum\` VARCHAR(64) NOT NULL,
  \`finished_at\` DATETIME(3) NULL,
  \`migration_name\` VARCHAR(255) NOT NULL,
  \`logs\` TEXT NULL,
  \`rolled_back_at\` DATETIME(3) NULL,
  \`started_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`applied_steps_count\` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;

interface Row {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

export interface MigrateResult {
  applied: string[];
  alreadyApplied: number;
  warnings: string[];
}

/** Applies pending migrations in order; stops at the first failure and records it like Prisma. */
export async function migrate(databaseUrl: string, dir: string, log: (line: string) => void = () => {}) {
  const migrations = readMigrations(dir);
  const { connectionLimit: _unused, ...cfg } = poolConfigFromUrl(databaseUrl);
  const conn = await mariadb.createConnection({ ...cfg, multipleStatements: true });
  const result: MigrateResult = { applied: [], alreadyApplied: 0, warnings: [] };
  try {
    // One migrator at a time (a deploy and a manual run must not interleave).
    const [lock] = await conn.query("SELECT GET_LOCK('ai_sales_hq_migrate', 30) AS ok");
    if (Number(lock.ok) !== 1) throw new Error('Another migration run holds the lock');
    await conn.query(TABLE);
    const rows = (await conn.query(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM `_prisma_migrations`',
    )) as Row[];
    const live = rows.filter((r) => r.rolled_back_at === null);
    const failed = live.find((r) => r.finished_at === null);
    if (failed) {
      throw new Error(
        `Migration ${failed.migration_name} failed earlier and was not finished. Restore the backup taken before the deploy, then deploy again.`,
      );
    }
    const done = new Map(live.map((r) => [r.migration_name, r.checksum]));
    for (const m of migrations) {
      const checksum = done.get(m.name);
      if (checksum !== undefined) {
        result.alreadyApplied++;
        if (checksum !== m.checksum) result.warnings.push(`${m.name}: file changed after it was applied`);
        continue;
      }
      const id = randomUUID();
      await conn.query(
        'INSERT INTO `_prisma_migrations` (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, NOW(3), 0)',
        [id, m.checksum, m.name],
      );
      log(`Applying ${m.name}`);
      try {
        await conn.query(m.sql);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await conn.query('UPDATE `_prisma_migrations` SET logs = ? WHERE id = ?', [message.slice(0, 60_000), id]);
        throw new Error(`Migration ${m.name} failed: ${message}`);
      }
      await conn.query('UPDATE `_prisma_migrations` SET finished_at = NOW(3), applied_steps_count = 1 WHERE id = ?', [
        id,
      ]);
      result.applied.push(m.name);
    }
    for (const name of done.keys()) {
      if (!migrations.some((m) => m.name === name))
        result.warnings.push(`${name}: applied but missing in this release`);
    }
    return result;
  } finally {
    await conn.query("SELECT RELEASE_LOCK('ai_sales_hq_migrate')").catch(() => undefined);
    await conn.end();
  }
}
