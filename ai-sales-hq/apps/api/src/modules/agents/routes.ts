import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OWNER_ACTIONS } from '../../domain/agent-lifecycle';
import { AGENT_KEYS } from '../../domain/agents';
import { parseBody, requireAuth } from '../../http/guard';
import type { Db } from '../../lib/db';
import { writeAudit } from '../audit';
import type { AgentService } from './service';

const keyParam = z.object({ key: z.enum(AGENT_KEYS) });
const actionParam = keyParam.extend({ action: z.enum(OWNER_ACTIONS) });
const settingsBody = z.object({
  workingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  dailyTaskLimit: z.number().int().min(1).max(10_000),
});

// Cron runs every minute; no run for 3 minutes means cron is not set up or failing.
const WORKER_STALE_MS = 3 * 60_000;

export function agentRoutes(app: FastifyInstance, deps: { db: Db; agents: AgentService; now: () => Date }) {
  const { db, agents, now } = deps;

  app.get('/control/overview', { config: { access: 'agents.view' } }, async () => {
    await agents.ensureAgents();
    const [list, lastRun, queued, running, dead] = await Promise.all([
      agents.overview(),
      db.workerRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      db.job.count({ where: { status: 'QUEUED' } }),
      db.job.count({ where: { status: 'RUNNING' } }),
      db.job.count({ where: { status: 'DEAD' } }),
    ]);
    return {
      agents: list,
      worker: {
        lastRunAt: lastRun?.startedAt ?? null,
        lastStatus: lastRun?.status ?? null,
        lastError: lastRun?.error ?? null,
        healthy: !!lastRun && now().getTime() - lastRun.startedAt.getTime() < WORKER_STALE_MS,
      },
      queue: { queued, running, dead },
      serverTime: now(),
    };
  });

  app.post('/agents/:key/:action', { config: { access: 'agents.control' } }, async (req) => {
    const { key, action } = parseBody(actionParam, req.params);
    const agent = await agents.command(key, action, { type: 'user', id: requireAuth(req).user.id });
    return { key: agent.key, state: agent.state };
  });

  app.post('/agents/:key/settings', { config: { access: 'agents.control' } }, async (req) => {
    const { key } = parseBody(keyParam, req.params);
    const body = parseBody(settingsBody, req.body);
    await agents.updateSettings(
      key,
      {
        schedule: { workingDays: body.workingDays, startTime: body.startTime, endTime: body.endTime },
        dailyTaskLimit: body.dailyTaskLimit,
      },
      requireAuth(req).user.id,
    );
    return { ok: true };
  });

  app.get('/agents/:key/history', { config: { access: 'agents.view' } }, async (req) => {
    const { key } = parseBody(keyParam, req.params);
    return { items: await agents.history(key) };
  });

  app.post('/control/stop-all', { config: { access: 'agents.control' } }, async (req) => {
    const actor = { type: 'user' as const, id: requireAuth(req).user.id };
    const stopped = await agents.stopAll(actor);
    await writeAudit(db, { actor, action: 'agents.stop_all', details: { stopped } });
    return { stopped };
  });

  app.get('/jobs', { config: { access: 'agents.view' } }, async (req) => {
    const q = parseBody(
      z.object({ status: z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED']).optional() }),
      req.query,
    );
    const jobs = await db.job.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { agent: { select: { key: true, name: true } }, events: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    return { items: jobs.map((j) => ({ ...j, events: j.events.map((e) => ({ ...e, id: Number(e.id) })) })) };
  });
}
