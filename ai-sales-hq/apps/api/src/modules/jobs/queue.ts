import { agentForJobType } from '../../domain/agents';
import { DEFAULT_MAX_ATTEMPTS } from '../../domain/jobs';
import type { Job } from '../../generated/prisma/client';
import type { Db } from '../../lib/db';

// Job types that belong to no agent: owner-facing plumbing that must keep working even when
// every agent is stopped (e.g. delivering "agent failed" notifications).
export const SYSTEM_JOB_TYPES = ['notify.telegram'] as const;

export interface EnqueueInput {
  type: string;
  payload?: object;
  runAt?: Date;
  // Same key => same job; enqueueing twice is a no-op (MASTER_SPEC §5 idempotent handlers).
  idempotencyKey?: string;
  maxAttempts?: number;
}

export async function enqueue(db: Db, input: EnqueueInput, now: Date): Promise<Job> {
  const system = (SYSTEM_JOB_TYPES as readonly string[]).includes(input.type);
  const agentKey = agentForJobType(input.type);
  if (!system && !agentKey) throw new Error(`No agent may run job type ${input.type}`);
  if (input.idempotencyKey) {
    const existing = await db.job.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
  }
  const agent = agentKey ? await db.agent.findUnique({ where: { key: agentKey } }) : null;
  if (agentKey && !agent) throw new Error(`Agent ${agentKey} is missing`);
  try {
    return await db.job.create({
      data: {
        type: input.type,
        agentId: agent?.id ?? null,
        payload: input.payload ?? undefined,
        idempotencyKey: input.idempotencyKey ?? null,
        runAt: input.runAt ?? now,
        maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        createdAt: now,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002' && input.idempotencyKey) {
      return db.job.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
    }
    throw err;
  }
}
