import { placesFor } from '../app';
import type { Config } from '../config';
import { toTashkent } from '../domain/schedule';
import type { CatalogSource } from '../integrations/firestore';
import type { PlacesClient } from '../integrations/places';
import type { Db } from '../lib/db';
import { CatalogSyncService } from '../modules/catalog/sync';
import { DiscoveryService, matchSettingsFrom } from '../modules/discovery/service';
import {
  DEFAULT_FIRESTORE_SETTINGS,
  firestoreSettingsSchema,
  INTEGRATION_FIRESTORE,
} from '../modules/integrations/service';
import { enqueue } from '../modules/jobs/queue';
import { ProspectService } from '../modules/prospects/service';
import type { TelegramService } from '../modules/telegram/service';
import { type JobHandler, type Planner, Worker } from './runner';

export interface WorkerDeps {
  db: Db;
  config: Config;
  getSource: () => CatalogSource | null;
  telegram: TelegramService;
  places?: PlacesClient | null;
  now?: () => Date;
}

/** Wires job handlers and periodic planners. Shared by the cron entry point and the tests. */
export function createWorker(deps: WorkerDeps, extraHandlers: Record<string, JobHandler> = {}): Worker {
  const now = deps.now ?? (() => new Date());
  const sync = new CatalogSyncService(deps.db, deps.getSource, now);
  const prospects = new ProspectService(deps.db, now, matchSettingsFrom(deps.db));
  const places = placesFor({ config: deps.config, places: deps.places });
  const discovery = new DiscoveryService(deps.db, prospects, deps.getSource, places, now);
  const agentActor = (key: string) => ({ type: 'worker' as const, id: key });

  const handlers = new Map<string, JobHandler>(
    Object.entries({
      'catalog.sync': async () => {
        const run = await sync.run({ trigger: 'SCHEDULED' });
        if (run.status === 'FAILED') throw new Error(run.errorMessage ?? 'catalog sync failed');
        return { runId: run.id, status: run.status };
      },
      'notify.telegram': async () => ({ sent: await deps.telegram.deliverPending() }),
      'prospects.score': async (ctx) => {
        const { prospectId } = ctx.payload as { prospectId: string };
        const p = await prospects.score(prospectId, agentActor('business_analyst'));
        return { score: p.score, stage: p.stage };
      },
      'discovery.firestore_stores': async () => discovery.importFirestoreStores(agentActor('market_research')),
      'discovery.places_search': async (ctx) => {
        const next = await discovery.nextSearch();
        await ctx.checkpoint();
        const result = await discovery.searchPlaces(next.query, next.district, agentActor('market_research'));
        await discovery.advanceCursor(next.cursor);
        await ctx.log('info', `${next.query} / ${next.district}: ${result.found} found, ${result.created} new`);
        return { ...next, ...result };
      },
      'discovery.places_refresh': async () => discovery.refreshExpiredPlaces(agentActor('market_research')),
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
    // Market research: existing stores once a day, Places searches within the daily budget.
    async (at) => {
      const agent = await deps.db.agent.findUnique({ where: { key: 'market_research' } });
      if (agent?.state !== 'RUNNING') return;
      const day = toTashkent(at).date;
      if (deps.getSource()) {
        await enqueue(
          deps.db,
          { type: 'discovery.firestore_stores', idempotencyKey: `discovery.firestore:${day}` },
          at,
        );
      }
      if (places) {
        await enqueue(
          deps.db,
          { type: 'discovery.places_refresh', idempotencyKey: `discovery.places_refresh:${day}` },
          at,
        );
        const s = await discovery.settings();
        const busy = await deps.db.job.count({
          where: { type: 'discovery.places_search', status: { in: ['QUEUED', 'RUNNING'] } },
        });
        if (!busy && (await discovery.placesUsedToday()) < s.placesDailyLimit) {
          const minute = Math.floor(at.getTime() / 60_000);
          await enqueue(
            deps.db,
            { type: 'discovery.places_search', idempotencyKey: `discovery.places:${minute}`, maxAttempts: 2 },
            at,
          );
        }
      }
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
