import { aiProviderFor, placesFor } from '../app';
import type { Config } from '../config';
import { STATE_REASONS } from '../domain/agent-lifecycle';
import { startOfTashkentDay, toTashkent } from '../domain/schedule';
import type { AiDrafter } from '../integrations/ai';
import type { CatalogSource } from '../integrations/firestore';
import type { PlacesClient } from '../integrations/places';
import type { Db } from '../lib/db';
import { AppError } from '../lib/errors';
import { AgentService } from '../modules/agents/service';
import { CatalogSyncService } from '../modules/catalog/sync';
import { DiscoveryService, matchSettingsFrom } from '../modules/discovery/service';
import {
  DEFAULT_FIRESTORE_SETTINGS,
  firestoreSettingsSchema,
  INTEGRATION_FIRESTORE,
} from '../modules/integrations/service';
import { enqueue } from '../modules/jobs/queue';
import { notify } from '../modules/notifications/service';
import { ProspectService } from '../modules/prospects/service';
import { dailyReport } from '../modules/sales/report';
import { AiBudgetExceededError, SalesService } from '../modules/sales/service';
import type { TelegramService } from '../modules/telegram/service';
import { AgentHaltedError, type JobHandler, type Planner, Worker } from './runner';

export interface WorkerDeps {
  db: Db;
  config: Config;
  getSource: () => CatalogSource | null;
  telegram: TelegramService;
  places?: PlacesClient | null;
  drafters?: { fast: AiDrafter | null; strong: AiDrafter | null };
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
  const ai = aiProviderFor({ db: deps.db, config: deps.config, drafters: deps.drafters }, now);
  const sales = new SalesService(deps.db, prospects, () => ai.drafters(), now);
  const agents = new AgentService(deps.db, now);

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
      'outreach.draft': async (ctx) => {
        const { prospectId } = ctx.payload as { prospectId: string };
        try {
          const m = await sales.draftOutreach(prospectId, agentActor('communication'), { jobId: ctx.job.id });
          return { messageId: m.id, status: m.status, generatedBy: m.generatedBy };
        } catch (err) {
          if (err instanceof AiBudgetExceededError) {
            // A6: budget hit -> PAUSED with BUDGET_EXCEEDED; the job waits in the queue unharmed.
            const agent = await deps.db.agent.findUniqueOrThrow({ where: { key: 'communication' } });
            if (agent.state === 'RUNNING') {
              await agents.transition(
                agent.id,
                'RUNNING',
                'PAUSING',
                STATE_REASONS.BUDGET_EXCEEDED,
                agentActor('communication'),
              );
            }
            throw new AgentHaltedError(err.message);
          }
          // Business refusals (cooldown, daily limit, suppressed, no contact) are outcomes, not failures.
          if (err instanceof AppError && (err.statusCode === 409 || err.statusCode === 429))
            return { skipped: err.code };
          throw err;
        }
      },
      'sales.followups': async () => {
        const due = await deps.db.conversation.count({ where: { followUpAt: { lte: now() } } });
        if (due > 0) {
          await notify(
            deps.db,
            {
              kind: 'sales.followups',
              severity: 'INFO',
              title: `Bugun ${due} ta mijozga qayta murojaat`,
              body: "Murojaatlar sahifasida ro'yxat bor.",
              link: '/outreach/',
              dedupeKey: 'sales-followups',
            },
            now(),
          );
        }
        return { due };
      },
      'director.daily_report': async () => dailyReport(deps.db, now()),
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
    // Communication: drafts for qualified prospects, within the daily limit (owner sends them himself).
    async (at) => {
      const agent = await deps.db.agent.findUnique({ where: { key: 'communication' } });
      if (agent?.state !== 'RUNNING') return;
      const s = await sales.settings();
      const today = await deps.db.message.count({
        where: { direction: 'OUTBOUND', createdAt: { gte: startOfTashkentDay(at) } },
      });
      const room = Math.min(5, s.dailyDraftLimit - today);
      if (room <= 0) return;
      const candidates = await deps.db.prospect.findMany({
        where: {
          stage: 'QUALIFIED',
          contacts: { some: { kind: { in: ['PHONE', 'TELEGRAM'] } } },
        },
        orderBy: { score: 'desc' },
        take: room,
      });
      const day = toTashkent(at).date;
      for (const p of candidates) {
        await enqueue(
          deps.db,
          { type: 'outreach.draft', payload: { prospectId: p.id }, idempotencyKey: `outreach.draft:${p.id}:${day}` },
          at,
        );
      }
    },
    // Sales: morning reminder of follow-ups; Director: report after 18:00 Tashkent.
    async (at) => {
      const local = toTashkent(at);
      const sales_ = await deps.db.agent.findUnique({ where: { key: 'sales' } });
      if (sales_?.state === 'RUNNING') {
        await enqueue(deps.db, { type: 'sales.followups', idempotencyKey: `sales.followups:${local.date}` }, at);
      }
      const director = await deps.db.agent.findUnique({ where: { key: 'director' } });
      if (director?.state === 'RUNNING' && local.minutes >= 18 * 60) {
        await enqueue(deps.db, { type: 'director.daily_report', idempotencyKey: `director.report:${local.date}` }, at);
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
