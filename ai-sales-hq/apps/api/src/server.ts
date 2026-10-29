// Entry point for cPanel "Setup Node.js App" (Passenger) and local development.
import { resolve } from 'node:path';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createDb } from './lib/db';
import { loadEnvFile } from './lib/env-file';
import { redactText } from './lib/logger';

async function main() {
  loadEnvFile(resolve(__dirname, '..'));
  const config = loadConfig();
  const db = createDb(config.DATABASE_URL);
  const webDir = process.env.WEB_DIST_DIR ?? resolve(__dirname, '..', '..', 'web', 'out');
  const app = await buildApp({ config, db, webDir });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Passenger provides PORT (or intercepts listen()); locally the configured port is used.
  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err: unknown) => {
  // Config errors list variable names only; still mask anything secret-looking.
  process.stderr.write(`${redactText(err instanceof Error ? err.message : String(err))}\n`);
  process.exit(1);
});
