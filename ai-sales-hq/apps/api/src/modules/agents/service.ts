import {
  type AgentState,
  allowedActions,
  assertTransition,
  IllegalTransitionError,
  type OwnerAction,
  STATE_REASONS,
  settledState,
  targetState,
} from '../../domain/agent-lifecycle';
import { AGENT_DEFINITIONS, type AgentDefinition, definitionFor, isAvailable } from '../../domain/agents';
import {
  DEFAULT_SCHEDULE,
  isValidSchedule,
  isWithinSchedule,
  type Schedule,
  startOfTashkentDay,
} from '../../domain/schedule';
import type { Agent } from '../../generated/prisma/client';
import type { Db } from '../../lib/db';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import { type Actor, writeAudit } from '../audit';

export function scheduleOf(agent: Pick<Agent, 'workingDays' | 'startTime' | 'endTime'>): Schedule {
  const days = Array.isArray(agent.workingDays) ? (agent.workingDays as number[]) : DEFAULT_SCHEDULE.workingDays;
  return { workingDays: days, startTime: agent.startTime, endTime: agent.endTime };
}

export class AgentService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Creates rows for agents that do not exist yet (idempotent). New agents start as DRAFT. */
  async ensureAgents(): Promise<void> {
    const existing = new Set((await this.db.agent.findMany({ select: { key: true } })).map((a) => a.key));
    for (const def of AGENT_DEFINITIONS) {
      if (existing.has(def.key)) continue;
      await this.db.agent
        .create({
          data: {
            key: def.key,
            name: def.name,
            state: 'DRAFT',
            stateChangedAt: this.now(),
            workingDays: DEFAULT_SCHEDULE.workingDays,
            startTime: DEFAULT_SCHEDULE.startTime,
            endTime: DEFAULT_SCHEDULE.endTime,
            dailyTaskLimit: def.defaultDailyTaskLimit,
          },
        })
        .catch((err: { code?: string }) => {
          if (err.code !== 'P2002') throw err; // created concurrently
        });
    }
  }

  /**
   * The only way an agent's state changes. Conditional on the expected current state, so two
   * concurrent writers cannot both win. Writes an AuditLog row (A7).
   */
  async transition(agentId: string, from: AgentState, to: AgentState, reason: string, actor: Actor): Promise<void> {
    assertTransition(from, to);
    const res = await this.db.agent.updateMany({
      where: { id: agentId, state: from },
      data: {
        state: to,
        stateReason: reason,
        stateChangedAt: this.now(),
        ...(to === 'STOPPED' || to === 'RUNNING' ? { errorMessage: null } : {}),
      },
    });
    if (res.count !== 1) throw conflict('state_changed', "Agent holati o'zgargan — sahifani yangilang");
    await writeAudit(this.db, {
      actor,
      action: 'agent.transition',
      entityType: 'agent',
      entityId: agentId,
      details: { from, to, reason },
    });
  }

  async command(key: string, action: OwnerAction, actor: Actor): Promise<Agent> {
    await this.ensureAgents();
    const def = definitionFor(key);
    const agent = await this.db.agent.findUnique({ where: { key } });
    if (!def || !agent) throw notFound('Agent topilmadi');
    if ((action === 'activate' || action === 'start') && !isAvailable(def)) {
      throw new AppError(409, 'not_available', `Bu agent ${def.availableFromPhase}-bosqichda ishga tushadi`);
    }
    const to = targetState(action, agent.state, isWithinSchedule(scheduleOf(agent), this.now()));
    if (!to) {
      throw new AppError(409, 'illegal_action', `"${agent.state}" holatida bu amalni bajarib bo'lmaydi`);
    }
    try {
      await this.transition(agent.id, agent.state, to, STATE_REASONS.OWNER, actor);
    } catch (err) {
      if (err instanceof IllegalTransitionError) throw conflict('illegal_action', err.message);
      throw err;
    }
    if (to === 'STOPPING') await this.#cancelWork(agent.id);
    await this.settle(agent.id, actor);
    return this.db.agent.findUniqueOrThrow({ where: { id: agent.id } });
  }

  /** PAUSING/STOPPING finish as soon as the agent has no job in progress. */
  async settle(agentId: string, actor: Actor): Promise<void> {
    const agent = await this.db.agent.findUniqueOrThrow({ where: { id: agentId } });
    const to = settledState(agent.state);
    if (!to) return;
    const busy = await this.db.job.count({ where: { agentId, status: 'RUNNING' } });
    if (busy === 0) await this.transition(agentId, agent.state, to, agent.stateReason ?? STATE_REASONS.OWNER, actor);
  }

  /** Stop = no new work; queued jobs are cancelled, running ones are asked to stop at their next checkpoint. */
  async #cancelWork(agentId: string): Promise<void> {
    const now = this.now();
    await this.db.job.updateMany({
      where: { agentId, status: 'QUEUED' },
      data: { status: 'CANCELLED', finishedAt: now, lastError: "Agent to'xtatildi" },
    });
    await this.db.job.updateMany({ where: { agentId, status: 'RUNNING' }, data: { cancelRequestedAt: now } });
  }

  async stopAll(actor: Actor): Promise<number> {
    const agents = await this.db.agent.findMany({ where: { state: { in: ['RUNNING', 'SCHEDULED', 'PAUSED'] } } });
    let stopped = 0;
    for (const a of agents) {
      try {
        await this.transition(a.id, a.state, 'STOPPING', STATE_REASONS.STOP_ALL, actor);
        await this.#cancelWork(a.id);
        await this.settle(a.id, actor);
        stopped++;
      } catch (err) {
        if (!(err instanceof AppError)) throw err; // state changed meanwhile: skip
      }
    }
    return stopped;
  }

  async updateSettings(
    key: string,
    input: { schedule: Schedule; dailyTaskLimit: number },
    actorUserId: string,
  ): Promise<void> {
    if (!isValidSchedule(input.schedule)) throw badRequest('invalid_schedule', "Ish jadvali noto'g'ri");
    const agent = await this.db.agent.findUnique({ where: { key } });
    if (!agent) throw notFound('Agent topilmadi');
    const days = [...new Set(input.schedule.workingDays)].sort();
    await this.db.agent.update({
      where: { id: agent.id },
      data: {
        workingDays: days,
        startTime: input.schedule.startTime,
        endTime: input.schedule.endTime,
        dailyTaskLimit: input.dailyTaskLimit,
      },
    });
    await writeAudit(this.db, {
      actor: { type: 'user', id: actorUserId },
      action: 'agent.settings',
      entityType: 'agent',
      entityId: agent.id,
      details: {
        workingDays: days,
        startTime: input.schedule.startTime,
        endTime: input.schedule.endTime,
        dailyTaskLimit: input.dailyTaskLimit,
      },
    });
  }

  async tasksToday(agentId: string): Promise<number> {
    return this.db.job.count({ where: { agentId, startedAt: { gte: startOfTashkentDay(this.now()) } } });
  }

  async overview() {
    const now = this.now();
    const dayStart = startOfTashkentDay(now);
    const agents = await this.db.agent.findMany({ orderBy: { createdAt: 'asc' } });
    const result = [];
    for (const a of agents) {
      const def = definitionFor(a.key) as AgentDefinition;
      const [current, recent, failures, today, queued] = await Promise.all([
        this.db.job.findFirst({ where: { agentId: a.id, status: 'RUNNING' }, orderBy: { startedAt: 'desc' } }),
        this.db.job.findMany({
          where: { agentId: a.id, status: { in: ['SUCCEEDED', 'DEAD', 'FAILED', 'CANCELLED'] } },
          orderBy: { finishedAt: 'desc' },
          take: 5,
        }),
        this.db.job.count({ where: { agentId: a.id, status: 'DEAD', finishedAt: { gte: dayStart } } }),
        this.db.job.count({ where: { agentId: a.id, startedAt: { gte: dayStart } } }),
        this.db.job.count({ where: { agentId: a.id, status: 'QUEUED' } }),
      ]);
      const schedule = scheduleOf(a);
      const available = isAvailable(def);
      result.push({
        key: a.key,
        name: a.name,
        role: def.role,
        room: def.room,
        state: a.state,
        stateReason: a.stateReason,
        stateChangedAt: a.stateChangedAt,
        errorMessage: a.errorMessage,
        available,
        availableFromPhase: def.availableFromPhase,
        schedule,
        inWorkingHours: isWithinSchedule(schedule, now),
        dailyTaskLimit: a.dailyTaskLimit,
        tasksToday: today,
        failuresToday: failures,
        queued,
        currentJob: current ? { id: current.id, type: current.type, startedAt: current.startedAt } : null,
        recentJobs: recent.map((j) => ({
          id: j.id,
          type: j.type,
          status: j.status,
          finishedAt: j.finishedAt,
          lastError: j.lastError,
        })),
        allowedActions: allowedActions(a.state).filter((x) => available || (x !== 'activate' && x !== 'start')),
      });
    }
    return result;
  }

  async history(key: string) {
    const agent = await this.db.agent.findUnique({ where: { key } });
    if (!agent) throw notFound('Agent topilmadi');
    const rows = await this.db.auditLog.findMany({
      where: { entityType: 'agent', entityId: agent.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({ ...r, id: Number(r.id) }));
  }
}
