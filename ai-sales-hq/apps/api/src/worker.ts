// cPanel cron entry (A2): `node dist/worker.js --once [--max-seconds 50]`, every minute.
// Takes a DB lock so two runs never overlap, works until its time budget, then exits.
import { catalogSourceFor } from './app';
import { loadConfig } from './config';
import { createDb } from './lib/db';
import { loadEnvFile } from './lib/env-file';
import { createLogger, redactText } from './lib/logger';
import { AgentService } from './modules/agents/service';
import { telegramApi } from './modules/telegram/client';
import { TelegramService } from './modules/telegram/service';
import { createWorker } from './worker/setup';

function maxSeconds(argv: string[]): number {
  const i = argv.indexOf('--max-seconds');
  const value = i >= 0 ? Number(argv[i + 1]) : 50;
  if (!Number.isFinite(value) || value < 5 || value > 55) throw new Error('--max-seconds must be between 5 and 55');
  return value;
}

async function main() {
  if (!process.argv.includes('--once')) throw new Error('Usage: node dist/worker.js --once [--max-seconds 50]');
  loadEnvFile();
  const config = loadConfig();
  const log = createLogger(config.LOG_LEVEL);
  const db = createDb(config.DATABASE_URL);
  try {
    const api = config.TELEGRAM_BOT_TOKEN ? telegramApi(config.TELEGRAM_BOT_TOKEN) : null;
    const telegram = new TelegramService(db, config, api, new AgentService(db));
    const worker = createWorker({ db, config, getSource: catalogSourceFor({ config, db }), telegram });
    const result = await worker.tick({ budgetMs: maxSeconds(process.argv) * 1000 });
    log.info(result, 'worker tick finished');
    process.exitCode = result.status === 'FAILED' ? 1 : 0;
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${redactText(err instanceof Error ? err.message : String(err))}\n`);
  process.exit(1);
});
