import { randomUUID } from 'node:crypto';
import { type AgentState, mayTakeWork, STATE_REASONS, settledState } from '../domain/agent-lifecycle';
import { definitionFor } from '../domain/agents';
import { nextAfterFailure, PermanentJobError } from '../domain/jobs';
import { isWithinSchedule, startOfTashkentDay } from '../domain/schedule';
import type { Agent, Job } from '../generated/prisma/client';
import type { Db } from '../lib/db';
import { AppError } from '../lib/errors';
import { acquireLock, releaseLock } from '../lib/locks';
import { redactText } from '../lib/logger';
import { AgentService, scheduleOf } from '../modules/agents/service';
import { SYSTEM_JOB_TYPES } from '../modules/jobs/queue';
import { notify } from '../modules/notifications/service';

export class JobCancelledError extends Error {}
export class AgentHaltedError extends Error {}

export interface JobContext {
  job: Job;
  payload: unknown;
  now: () => Date;
  log: (level: 'info' | 'warn' | 'error', message: string) => Promise<void>;
  /** Call between steps of long work: throws if the job was cancelled or the agent left RUNNING. */
  checkpoint: () => Promise<void>;
}

export type JobHandler = (ctx: JobContext) => Promise<object | undefined>;

/** Enqueues periodic work (scheduled sync, notification delivery) at the start of each tick. */
export type Planner = (now: Date) => Promise<void>;

export interface WorkerOptions {
  budgetMs: number; // hard time budget for one cron run (A2: ≤ 50 s)
  holder?: string;
}

export interface TickResult {
  status: 'OK' | 'SKIPPED_LOCKED' | 'FAILED';
  jobsProcessed: number;
  transitions: number;
}

const WORKER_LOCK = 'worker';
const ACTOR = { type: 'worker' as const };

export class Worker {
  readonly #agents: AgentService;
  #transitions = 0;

  constructor(
    private readonly db: Db,
    private readonly handlers: ReadonlyMap<string, JobHandler>,
    private readonly planners: readonly Planner[],
    private readonly now: () => Date = () => new Date(),
  ) {
    this.#agents = new AgentService(db, now);
  }

  async tick(opts: WorkerOptions): Promise<TickResult> {
    const holder = opts.holder ?? randomUUID();
    const started = Date.now();
    const deadline = started + opts.budgetMs;
    // The lease outlives the budget a little so a crashed run cannot block the next minute for long.
    if (!(await acquireLock(this.db, WORKER_LOCK, holder, opts.budgetMs + 30_000, this.now()))) {
      return { status: 'SKIPPED_LOCKED', jobsProcessed: 0, transitions: 0 };
    }
    this.#transitions = 0;
    const run = await this.db.workerRun.create({ data: { startedAt: this.now(), status: 'RUNNING' } });
    let processed = 0;
    try {
      await this.#agents.ensureAgents();
      await this.#recoverStale();
      await this.#applySchedules();
      for (const plan of this.planners) await plan(this.now());
      while (Date.now() < deadline) {
        const job = await this.#claimNext(
          new Date(this.now().getTime() + Math.max(deadline - Date.now(), 1000) + 30_000),
          holder,
        );
        if (!job) break;
        await this.#execute(job);
        processed++;
      }
      await this.#settleAll();
      await this.db.workerRun.update({
        where: { id: run.id },
        data: { status: 'OK', finishedAt: this.now(), jobsProcessed: processed, transitions: this.#transitions },
      });
      return { status: 'OK', jobsProcessed: processed, transitions: this.#transitions };
    } catch (err) {
      await this.db.workerRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: this.now(),
          jobsProcessed: processed,
          error: redactText(err instanceof Error ? err.message : String(err)).slice(0, 1000),
        },
      });
      return { status: 'FAILED', jobsProcessed: processed, transitions: this.#transitions };
    } finally {
      await releaseLock(this.db, WORKER_LOCK, holder);
    }
  }

  async #move(agent: Agent, to: AgentState, reason: string): Promise<boolean> {
    try {
      await this.#agents.transition(agent.id, agent.state, to, reason, ACTOR);
      this.#transitions++;
      return true;
    } catch (err) {
      if (err instanceof AppError) return false; // the owner changed it meanwhile
      throw err;
    }
  }

  /** RUNNING jobs whose lease expired belong to a crashed run: retry or give up. */
  async #recoverStale(): Promise<void> {
    const stale = await this.db.job.findMany({ where: { status: 'RUNNING', lockedUntil: { lt: this.now() } } });
    for (const job of stale) {
      await this.#fail(job, new Error('Worker stopped before the job finished'), false);
    }
  }

  async #applySchedules(): Promise<void> {
    const now = this.now();
    const dayStart = startOfTashkentDay(now);
    const agents = await this.db.agent.findMany({ where: { state: { in: ['SCHEDULED', 'RUNNING', 'PAUSED'] } } });
    for (const a of agents) {
      const inHours = isWithinSchedule(scheduleOf(a), now);
      if (a.state === 'SCHEDULED' && inHours) {
        await this.#move(a, 'RUNNING', STATE_REASONS.WORKING_HOURS);
      } else if (a.state === 'RUNNING' && !inHours) {
        const busy = await this.db.job.count({ where: { agentId: a.id, status: 'RUNNING' } });
        if (!busy) await this.#move(a, 'SCHEDULED', STATE_REASONS.OUTSIDE_WORKING_HOURS);
      } else if (
        a.state === 'PAUSED' &&
        a.stateReason === STATE_REASONS.BUDGET_EXCEEDED &&
        a.stateChangedAt < dayStart
      ) {
        // Daily limits reset at Tashkent midnight; a budget pause lifts by itself (owner pauses do not).
        await this.#move(a, inHours ? 'RUNNING' : 'SCHEDULED', STATE_REASONS.BUDGET_RESET);
      }
    }
  }

  async #claimNext(lockedUntil: Date, holder: string): Promise<(Job & { agent: Agent | null }) | null> {
    const now = this.now();
    const candidates = await this.db.job.findMany({
      where: { status: 'QUEUED', runAt: { lte: now } },
      orderBy: [{ runAt: 'asc' }, { createdAt: 'asc' }],
      take: 25,
      include: { agent: true },
    });
    const dayStart = startOfTashkentDay(now);
    for (const job of candidates) {
      const system = (SYSTEM_JOB_TYPES as readonly string[]).includes(job.type);
      if (!system) {
        const agent = job.agent;
        const def = agent ? definitionFor(agent.key) : undefined;
        if (!agent || !def?.jobTypes.includes(job.type)) {
          await this.#finish(job, 'DEAD', { error: `Job type ${job.type} is not permitted for this agent` });
          continue;
        }
        // A7: the worker checks the agent's state before taking each job.
        if (!mayTakeWork(agent.state)) continue;
        const today = await this.db.job.count({ where: { agentId: agent.id, startedAt: { gte: dayStart } } });
        if (today >= agent.dailyTaskLimit) {
          // A6: limit hit -> PAUSED with reason BUDGET_EXCEEDED (lifted at the next Tashkent midnight).
          if (await this.#move(agent, 'PAUSING', STATE_REASONS.BUDGET_EXCEEDED)) {
            await notify(
              this.db,
              {
                kind: 'agent.budget_exceeded',
                severity: 'WARNING',
                title: `${agent.name}: kunlik limit tugadi`,
                body: `Bugun ${today} ta vazifa bajarildi (limit ${agent.dailyTaskLimit}). Agent ertaga avtomatik davom etadi.`,
                link: '/agents/',
                dedupeKey: `agent-budget-${agent.id}`,
              },
              now,
            );
          }
          continue;
        }
      }
      const claimed = await this.db.job.updateMany({
        where: { id: job.id, status: 'QUEUED' },
        data: { status: 'RUNNING', lockedBy: holder, lockedUntil, attempts: { increment: 1 }, startedAt: now },
      });
      if (claimed.count === 1)
        return this.db.job.findUniqueOrThrow({ where: { id: job.id }, include: { agent: true } });
    }
    return null;
  }

  async #execute(job: Job & { agent: Agent | null }): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      await this.#fail(job, new PermanentJobError(`No handler for ${job.type}`), true);
      return;
    }
    const ctx: JobContext = {
      job,
      payload: job.payload,
      now: this.now,
      log: async (level, message) => {
        await this.db.jobEvent.create({
          data: { jobId: job.id, level, message: redactText(message).slice(0, 1000), createdAt: this.now() },
        });
      },
      checkpoint: async () => {
        const fresh = await this.db.job.findUniqueOrThrow({ where: { id: job.id }, include: { agent: true } });
        if (fresh.cancelRequestedAt) throw new JobCancelledError('Cancelled');
        if (fresh.agent && !mayTakeWork(fresh.agent.state)) throw new AgentHaltedError(fresh.agent.state);
      },
    };
    try {
      const result = await handler(ctx);
      await this.#finish(job, 'SUCCEEDED', { result });
    } catch (err) {
      if (err instanceof JobCancelledError) {
        await this.#finish(job, 'CANCELLED', { error: "Agent to'xtatildi" });
      } else if (err instanceof AgentHaltedError) {
        // Not the job's fault: put it back without spending an attempt.
        await this.db.job.update({
          where: { id: job.id },
          data: { status: 'QUEUED', lockedBy: null, lockedUntil: null, startedAt: null, attempts: { decrement: 1 } },
        });
      } else {
        await this.#fail(job, err, err instanceof PermanentJobError);
      }
    }
  }

  async #finish(job: Job, status: 'SUCCEEDED' | 'DEAD' | 'CANCELLED', out: { result?: object; error?: string }) {
    await this.db.job.update({
      where: { id: job.id },
      data: {
        status,
        finishedAt: this.now(),
        lockedBy: null,
        lockedUntil: null,
        result: out.result
          ? JSON.parse(JSON.stringify(out.result, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)))
          : undefined,
        lastError: out.error ?? (status === 'SUCCEEDED' ? null : undefined),
      },
    });
  }

  async #fail(job: Job, err: unknown, permanent: boolean): Promise<void> {
    const message = redactText(err instanceof Error ? err.message : String(err)).slice(0, 1000);
    const next = nextAfterFailure(job.attempts, job.maxAttempts, permanent);
    await this.db.jobEvent.create({ data: { jobId: job.id, level: 'error', message, createdAt: this.now() } });
    if (next.status === 'QUEUED') {
      await this.db.job.update({
        where: { id: job.id },
        data: {
          status: 'QUEUED',
          lastError: message,
          lockedBy: null,
          lockedUntil: null,
          runAt: new Date(this.now().getTime() + next.delaySeconds * 1000),
        },
      });
      return;
    }
    await this.#finish(job, 'DEAD', { error: message });
    const agent = job.agentId ? await this.db.agent.findUnique({ where: { id: job.agentId } }) : null;
    if (agent?.state === 'RUNNING') {
      // A7: RUNNING -> ERROR; the owner must acknowledge before it can run again.
      if (await this.#move(agent, 'ERROR', STATE_REASONS.JOB_FAILED)) {
        await this.db.agent.update({
          where: { id: agent.id },
          data: { errorMessage: `${job.type}: ${message}`.slice(0, 500) },
        });
      }
    }
    await notify(
      this.db,
      {
        kind: 'job.dead',
        severity: 'CRITICAL',
        title: agent ? `${agent.name}: vazifa bajarilmadi` : 'Tizim vazifasi bajarilmadi',
        body: `${job.type}: ${message}`,
        link: '/agents/',
        dedupeKey: `job-dead-${job.type}`,
      },
      this.now(),
    );
  }

  async #settleAll(): Promise<void> {
    const agents = await this.db.agent.findMany({ where: { state: { in: ['PAUSING', 'STOPPING'] } } });
    for (const a of agents) {
      const to = settledState(a.state);
      const busy = await this.db.job.count({ where: { agentId: a.id, status: 'RUNNING' } });
      if (to && !busy) await this.#move(a, to, a.stateReason ?? STATE_REASONS.OWNER);
    }
  }
}
