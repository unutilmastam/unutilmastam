import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { createDb } from '../../src/lib/db';
import { AgentService } from '../../src/modules/agents/service';
import { enqueue } from '../../src/modules/jobs/queue';
import { TelegramService } from '../../src/modules/telegram/service';
import type { JobHandler } from '../../src/worker/runner';
import { createWorker } from '../../src/worker/setup';
import { FakeCatalogSource, FakeTelegram, hasDb, resetDb } from '../helpers';

// Wednesday 2026-10-28 10:00 Tashkent (inside the default 09:00–19:00 Mon–Sat schedule).
const WED_10 = new Date('2026-10-28T05:00:00Z');
const WED_20 = new Date('2026-10-28T15:00:00Z');

describe.skipIf(!hasDb)('cron worker (MySQL)', () => {
  const config = loadConfig({ ...process.env, TELEGRAM_OWNER_CHAT_IDS: '111' });
  const db = createDb(config.DATABASE_URL);
  let clock = WED_10;
  const now = () => clock;
  const agents = new AgentService(db, now);
  const source = new FakeCatalogSource();
  const tg = new FakeTelegram();
  const telegram = new TelegramService(db, config, tg, agents, now);
  let syncHandler: JobHandler | undefined;
  const worker = () =>
    createWorker(
      { db, config, getSource: () => source, telegram, now },
      syncHandler ? { 'catalog.sync': syncHandler } : {},
    );
  const tick = () => worker().tick({ budgetMs: 5_000 });
  const owner = { type: 'user' as const, id: 'owner-1' };
  const director = () => db.agent.findUniqueOrThrow({ where: { key: 'director' } });

  beforeAll(async () => {
    await db.$queryRaw`SELECT 1`;
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
    clock = WED_10;
    syncHandler = undefined;
    source.products = [{ id: 'p1', name: 'Chuchvara', price: 25000 }];
    source.failWith = null;
    tg.calls = [];
    tg.failWith = null;
    await agents.ensureAgents();
  });

  it('agents start as DRAFT; unavailable agents cannot start; transitions are audited', async () => {
    expect((await db.agent.findMany()).every((a) => a.state === 'DRAFT')).toBe(true);
    await expect(agents.command('sales', 'activate', owner)).rejects.toMatchObject({ code: 'not_available' });
    await agents.command('director', 'activate', owner);
    await expect(agents.command('director', 'pause', owner)).rejects.toMatchObject({ code: 'illegal_action' });
    expect((await agents.command('director', 'start', owner)).state).toBe('RUNNING');
    const audit = await db.auditLog.findMany({ where: { action: 'agent.transition' }, orderBy: { id: 'asc' } });
    expect(audit.map((a) => a.details)).toEqual([
      { from: 'DRAFT', to: 'STOPPED', reason: 'OWNER' },
      { from: 'STOPPED', to: 'RUNNING', reason: 'OWNER' },
    ]);
  });

  it('follows the working schedule both ways', async () => {
    clock = WED_20;
    await agents.command('director', 'activate', owner);
    expect((await agents.command('director', 'start', owner)).state).toBe('SCHEDULED');
    await tick();
    expect((await director()).state).toBe('SCHEDULED');
    clock = new Date('2026-10-29T04:30:00Z'); // Thu 09:30
    await tick();
    expect((await director()).state).toBe('RUNNING');
    clock = new Date('2026-10-29T14:30:00Z'); // Thu 19:30
    await tick();
    expect(await director()).toMatchObject({ state: 'SCHEDULED', stateReason: 'OUTSIDE_WORKING_HOURS' });
  });

  it('schedules the catalog sync only while the Director runs, once per interval', async () => {
    await tick();
    expect(await db.job.count()).toBe(0);
    await agents.command('director', 'activate', owner);
    await agents.command('director', 'start', owner);
    const r = await tick();
    expect(r).toMatchObject({ status: 'OK', jobsProcessed: 1 });
    expect(await db.product.count()).toBe(1);
    await tick();
    expect(await db.job.count({ where: { type: 'catalog.sync' } })).toBe(1);
    clock = new Date(clock.getTime() + 31 * 60_000);
    await tick();
    expect(await db.job.count({ where: { type: 'catalog.sync', status: 'SUCCEEDED' } })).toBe(2);
    expect(await db.workerRun.count({ where: { status: 'OK' } })).toBe(4);
  });

  it('retries with backoff, then DEAD -> agent ERROR + notification; acknowledge -> STOPPED', async () => {
    syncHandler = async () => {
      throw new Error('boom');
    };
    await agents.command('director', 'activate', owner);
    await agents.command('director', 'start', owner);
    const job = await enqueue(db, { type: 'catalog.sync', idempotencyKey: 'x', maxAttempts: 2 }, clock);
    await db.integration.create({
      data: { key: 'firestore', status: 'CONFIGURED', settings: { syncEnabled: false, intervalMinutes: 30 } },
    });
    await tick();
    let j = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(j).toMatchObject({ status: 'QUEUED', attempts: 1, lastError: 'boom' });
    expect(j.runAt.getTime() - clock.getTime()).toBe(30_000);
    await tick(); // not due yet
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).attempts).toBe(1);
    clock = new Date(clock.getTime() + 31_000);
    await tick();
    j = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(j.status).toBe('DEAD');
    expect(await director()).toMatchObject({ state: 'ERROR', errorMessage: 'catalog.sync: boom' });
    expect(await db.notification.count({ where: { kind: 'job.dead' } })).toBe(1);
    await expect(agents.command('director', 'start', owner)).rejects.toMatchObject({ code: 'illegal_action' });
    expect((await agents.command('director', 'acknowledge', owner)).state).toBe('STOPPED');
  });

  it('pause during a job: job goes back to the queue unharmed, agent settles to PAUSED', async () => {
    syncHandler = async (ctx) => {
      // The owner presses pause while this job is mid-way.
      await agents.command('director', 'pause', owner);
      await ctx.checkpoint();
      return { unreachable: true };
    };
    await agents.command('director', 'activate', owner);
    await agents.command('director', 'start', owner);
    const job = await enqueue(db, { type: 'catalog.sync', idempotencyKey: 'p' }, clock);
    await db.integration.create({
      data: { key: 'firestore', status: 'CONFIGURED', settings: { syncEnabled: false, intervalMinutes: 30 } },
    });
    await tick();
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: 'QUEUED', attempts: 0 });
    expect((await director()).state).toBe('PAUSED');
    await tick();
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('QUEUED');
  });

  it('stop cancels queued work; stop_all reaches every live agent', async () => {
    await agents.command('director', 'activate', owner);
    await agents.command('director', 'start', owner);
    const job = await enqueue(db, { type: 'catalog.sync', idempotencyKey: 's' }, clock);
    expect((await agents.command('director', 'stop', owner)).state).toBe('STOPPED');
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('CANCELLED');
    await agents.command('director', 'start', owner);
    expect(await agents.stopAll(owner)).toBe(1);
    expect((await director()).state).toBe('STOPPED');
  });

  it('daily task limit pauses with BUDGET_EXCEEDED and lifts at Tashkent midnight', async () => {
    await agents.command('director', 'activate', owner);
    await agents.command('director', 'start', owner);
    await db.agent.update({ where: { key: 'director' }, data: { dailyTaskLimit: 1 } });
    await db.integration.create({
      data: { key: 'firestore', status: 'CONFIGURED', settings: { syncEnabled: false, intervalMinutes: 30 } },
    });
    await enqueue(db, { type: 'catalog.sync', idempotencyKey: 'a' }, clock);
    await enqueue(db, { type: 'catalog.sync', idempotencyKey: 'b' }, clock);
    const r = await tick();
    expect(r.jobsProcessed).toBe(1);
    expect(await director()).toMatchObject({ state: 'PAUSED', stateReason: 'BUDGET_EXCEEDED' });
    expect(await db.notification.count({ where: { kind: 'agent.budget_exceeded' } })).toBe(1);
    clock = new Date('2026-10-29T04:30:00Z'); // next day 09:30
    await tick();
    expect(await director()).toMatchObject({ state: 'RUNNING' });
    expect(await db.job.count({ where: { type: 'catalog.sync', status: 'SUCCEEDED' } })).toBe(2);
  });

  it('owner pause is never lifted automatically', async () => {
    await agents.command('director', 'activate', owner);
    await agents.command('director', 'start', owner);
    await agents.command('director', 'pause', owner);
    clock = new Date('2026-10-30T05:00:00Z');
    await tick();
    expect((await director()).state).toBe('PAUSED');
  });

  it('two overlapping runs: the second one skips', async () => {
    await db.lock.create({
      data: { name: 'worker', holder: 'other', lockedUntil: new Date(clock.getTime() + 60_000), acquiredAt: clock },
    });
    expect((await tick()).status).toBe('SKIPPED_LOCKED');
  });

  it('recovers jobs from a crashed run', async () => {
    await agents.command('director', 'activate', owner);
    await agents.command('director', 'start', owner);
    const job = await enqueue(db, { type: 'catalog.sync', idempotencyKey: 'c' }, clock);
    await db.job.update({
      where: { id: job.id },
      data: { status: 'RUNNING', attempts: 1, lockedUntil: new Date(clock.getTime() - 1000), startedAt: clock },
    });
    await db.integration.create({
      data: { key: 'firestore', status: 'CONFIGURED', settings: { syncEnabled: false, intervalMinutes: 30 } },
    });
    await tick();
    const j = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(j).toMatchObject({ status: 'QUEUED', lastError: 'Worker stopped before the job finished' });
  });

  it('delivers notifications to the owner Telegram chat even when agents are stopped', async () => {
    await db.notification.create({
      data: { kind: 'x', severity: 'CRITICAL', title: 'Sinov <b>', body: 'Matn', createdAt: clock },
    });
    await tick();
    const send = tg.calls.find((c) => c.method === 'sendMessage');
    expect(send?.body).toMatchObject({ chat_id: '111', parse_mode: 'HTML' });
    expect(String(send?.body.text)).toContain('Sinov &lt;b&gt;');
    expect(await db.notification.count({ where: { telegramSentAt: null } })).toBe(0);
    tg.calls = [];
    await tick();
    expect(tg.calls).toHaveLength(0);
  });
});
