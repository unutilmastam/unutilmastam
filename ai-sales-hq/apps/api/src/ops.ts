// Operations entry point for the hosting (cron, deploy script): no Prisma CLI, no npm.
//   node apps/api/dist/ops.js migrate       apply pending migrations
//   node apps/api/dist/ops.js check-config  validate the settings file (prints names only)
//   node apps/api/dist/ops.js mysql-cnf     print a [client] option file for mysqldump (stdout)
//   node apps/api/dist/ops.js db-name       print the database name
import { resolve } from 'node:path';
import { loadConfig } from './config';
import { poolConfigFromUrl } from './lib/db-config';
import { loadEnvFile } from './lib/env-file';
import { redactText } from './lib/logger';
import { migrate } from './lib/migrator';

async function main() {
  const command = process.argv[2];
  loadEnvFile(resolve(__dirname, '..'));
  if (command === 'check-config') {
    loadConfig();
    process.stdout.write('Config OK\n');
    return;
  }
  if (command === 'mysql-cnf') {
    const db = poolConfigFromUrl(loadConfig().DATABASE_URL);
    // Values are quoted for the option-file format; the caller writes this to a 600 file.
    const q = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    const lines = ['[client]', `user=${q(db.user)}`, `password=${q(db.password)}`];
    if ('socketPath' in db && db.socketPath) lines.push(`socket=${q(db.socketPath)}`);
    else lines.push(`host=${q(db.host)}`, `port=${db.port}`);
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }
  if (command === 'db-name') {
    process.stdout.write(`${poolConfigFromUrl(loadConfig().DATABASE_URL).database}\n`);
    return;
  }
  if (command === 'migrate') {
    const config = loadConfig();
    const dir = process.env.MIGRATIONS_DIR ?? resolve(__dirname, '..', 'prisma', 'migrations');
    const r = await migrate(config.DATABASE_URL, dir, (l) => process.stdout.write(`${l}\n`));
    for (const w of r.warnings) process.stdout.write(`WARNING ${w}\n`);
    process.stdout.write(`Migrations: ${r.applied.length} applied, ${r.alreadyApplied} already up to date\n`);
    return;
  }
  throw new Error('Usage: node apps/api/dist/ops.js migrate | check-config | mysql-cnf | db-name');
}

main().catch((err: unknown) => {
  process.stderr.write(`${redactText(err instanceof Error ? err.message : String(err))}\n`);
  process.exit(1);
});
