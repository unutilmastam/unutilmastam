// Job retry policy (MASTER_SPEC §5 orchestration: retries with backoff, no infinite loops).

export const JOB_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const DEFAULT_MAX_ATTEMPTS = 5;
const BASE_DELAY_SECONDS = 30;
const MAX_DELAY_SECONDS = 6 * 3600;

/** Exponential backoff: 30 s, 60 s, 120 s, ... capped at 6 h. `attempt` starts at 1. */
export function backoffSeconds(attempt: number): number {
  return Math.min(BASE_DELAY_SECONDS * 2 ** Math.max(0, attempt - 1), MAX_DELAY_SECONDS);
}

/** Errors a handler throws to say "retrying will not help" (bad input, missing config). */
export class PermanentJobError extends Error {}

export function nextAfterFailure(
  attempts: number,
  maxAttempts: number,
  permanent: boolean,
): { status: 'QUEUED'; delaySeconds: number } | { status: 'DEAD' } {
  if (permanent || attempts >= maxAttempts) return { status: 'DEAD' };
  return { status: 'QUEUED', delaySeconds: backoffSeconds(attempts) };
}
