import type { Config } from '../config';
import type { CatalogSource } from '../integrations/firestore';
import type { Db } from '../lib/db';
import { CatalogSyncService } from '../modules/catalog/sync';
import {
  DEFAULT_FIRESTORE_SETTINGS,
  firestoreSettingsSchema,
  INTEGRATION_FIRESTORE,
} from '../modules/integrations/service';
import { enqueue } from '../modules/jobs/queue';
import type { TelegramService } from '../modules/telegram/service';
import { type JobHandler, type Planner, Worker } from './runner';

export interface WorkerDeps {
  db: Db;
  config: Config;
  getSource: () => CatalogSource | null;
  telegram: TelegramService;
  now?: () => Date;
}

/** Wires job handlers and periodic planners. Shared by the cron entry point and the tests. */
export function createWorker(deps: WorkerDeps, extraHandlers: Record<string, JobHandler> = {}): Worker {
  const now = deps.now ?? (() => new Date());
  const sync = new CatalogSyncService(deps.db, deps.getSource, now);

  const handlers = new Map<string, JobHandler>(
    Object.entries({
      'catalog.sync': async () => {
        const run = await sync.run({ trigger: 'SCHEDULED' });
        if (run.status === 'FAILED') throw new Error(run.errorMessage ?? 'catalog sync failed');
        return { runId: run.id, status: run.status };
      },
      'notify.telegram': async () => ({ sent: await deps.telegram.deliverPending() }),
      ...extraHandlers,
    }),
  );

  const planners: Planner[] = [
    // Scheduled catalog sync: one job per interval bucket, only while the Director is working.
    async (at) => {
      if (!deps.getSource()) return;
      const director = await deps.db.agent.findUnique({ where: { key: 'director' } });
      if (director?.state !== 'RUNNING') return;
      const row = await deps.db.integration.findUnique({ where: { key: INTEGRATION_FIRESTORE } });
      const parsed = firestoreSettingsSchema.safeParse(row?.settings);
      const settings = parsed.success ? parsed.data : DEFAULT_FIRESTORE_SETTINGS;
      if (!settings.syncEnabled) return;
      const bucket = Math.floor(at.getTime() / (settings.intervalMinutes * 60_000));
      await enqueue(
        deps.db,
        { type: 'catalog.sync', idempotencyKey: `catalog.sync:${settings.intervalMinutes}:${bucket}` },
        at,
      );
    },
    // Owner notifications go out within a minute, whatever the agents are doing.
    async (at) => {
      if (!(await deps.telegram.hasPending())) return;
      const minute = Math.floor(at.getTime() / 60_000);
      await enqueue(
        deps.db,
        { type: 'notify.telegram', idempotencyKey: `notify.telegram:${minute}`, maxAttempts: 3 },
        at,
      );
    },
  ];

  return new Worker(deps.db, handlers, planners, now);
}
