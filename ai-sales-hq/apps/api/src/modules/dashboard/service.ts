import { AGENT_DEFINITIONS } from '../../domain/agents';
import { poseFor } from '../../domain/office';
import { startOfTashkentDay } from '../../domain/schedule';
import type { Db } from '../../lib/db';

/**
 * Director dashboard (MASTER_SPEC §17). Every figure is computed from persisted rows; metrics of
 * modules that do not exist yet are reported as `null` ("not available"), never as zero.
 */
export class DashboardService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async summary() {
    const now = this.now();
    const dayStart = startOfTashkentDay(now);
    const [agents, running, failedToday, unconfirmedPrices, heldRun, lastSync, firestore, telegram, unread] =
      await Promise.all([
        this.db.agent.findMany({ select: { state: true } }),
        this.db.job.count({ where: { status: 'RUNNING' } }),
        this.db.job.count({ where: { status: 'DEAD', finishedAt: { gte: dayStart } } }),
        this.db.productPrice.count({
          where: { status: 'OWNER_UNCONFIRMED', validTo: null, product: { isActive: true } },
        }),
        this.db.productSyncRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { status: true } }),
        this.db.productSyncRun.findFirst({
          where: { status: { in: ['SUCCEEDED', 'APPLIED_AFTER_HOLD'] } },
          orderBy: { startedAt: 'desc' },
          select: { finishedAt: true },
        }),
        this.db.integration.findUnique({ where: { key: 'firestore' }, select: { status: true } }),
        this.db.integration.findUnique({ where: { key: 'telegram' }, select: { status: true } }),
        this.db.notification.count({ where: { readAt: null } }),
      ]);
    const [prospectsToday, qualified, needsReview, prospectsTotal] = await Promise.all([
      this.db.prospect.count({ where: { discoveredAt: { gte: dayStart } } }),
      this.db.prospect.count({ where: { stage: 'QUALIFIED' } }),
      this.db.prospect.count({ where: { stage: 'NEEDS_VERIFICATION' } }),
      this.db.prospect.count(),
    ]);
    const count = (states: string[]) => agents.filter((a) => states.includes(a.state)).length;
    return {
      agents: {
        running: count(['RUNNING']),
        waiting: count(['SCHEDULED']),
        paused: count(['PAUSING', 'PAUSED']),
        stopped: count(['STOPPED', 'STOPPING', 'DRAFT']),
        disabled: count(['DISABLED']),
        error: count(['ERROR']),
      },
      tasksInProgress: running,
      attention: {
        failedJobsToday: failedToday,
        unconfirmedPrices,
        heldSync: heldRun?.status === 'HELD',
        agentErrors: count(['ERROR']),
        unreadNotifications: unread,
      },
      integrations: {
        website: firestore?.status ?? 'NOT_CONFIGURED',
        telegram: telegram?.status ?? 'NOT_CONFIGURED',
        // The AI provider arrives in Phase 6; until then it is honestly not configured.
        ai: 'NOT_CONFIGURED' as const,
      },
      lastSuccessfulSyncAt: lastSync?.finishedAt ?? null,
      prospects: { newToday: prospectsToday, qualified, needsReview, total: prospectsTotal },
      // Modules that arrive later (Phases 6–7): not available rather than a fake 0.
      conversations: { active: null },
      orders: { awaitingReview: null, draftValue: null, approvedValue: null, deliveredValue: null },
    };
  }

  async office() {
    const now = this.now();
    const agents = await this.db.agent.findMany({ orderBy: { createdAt: 'asc' } });
    const result = [];
    for (const a of agents) {
      const def = AGENT_DEFINITIONS.find((d) => d.key === a.key);
      const [runningJob, lastDone] = await Promise.all([
        this.db.job.findFirst({ where: { agentId: a.id, status: 'RUNNING' }, select: { type: true } }),
        this.db.job.findFirst({
          where: { agentId: a.id, status: 'SUCCEEDED' },
          orderBy: { finishedAt: 'desc' },
          select: { finishedAt: true, type: true },
        }),
      ]);
      result.push({
        key: a.key,
        name: a.name,
        room: def?.room ?? 'hq',
        state: a.state,
        pose: poseFor({
          state: a.state,
          hasRunningJob: !!runningJob,
          lastJobFinishedAt: lastDone?.finishedAt ?? null,
          now,
        }),
        currentJobType: runningJob?.type ?? null,
        lastJobType: lastDone?.type ?? null,
        lastJobFinishedAt: lastDone?.finishedAt ?? null,
      });
    }
    return { agents: result, serverTime: now };
  }
}
