// Agent lifecycle (SPEC_AMENDMENTS A7). The single source of truth for which state changes are
// legal; every caller (API, worker, Telegram) goes through `assertTransition`.

export const AGENT_STATES = [
  'DRAFT',
  'STOPPED',
  'SCHEDULED',
  'RUNNING',
  'PAUSING',
  'PAUSED',
  'STOPPING',
  'ERROR',
  'DISABLED',
] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export const TRANSITIONS: Readonly<Record<AgentState, readonly AgentState[]>> = {
  DRAFT: ['STOPPED'],
  STOPPED: ['SCHEDULED', 'RUNNING', 'DISABLED'],
  SCHEDULED: ['RUNNING', 'PAUSING', 'STOPPING', 'DISABLED'],
  RUNNING: ['PAUSING', 'STOPPING', 'ERROR', 'SCHEDULED'],
  PAUSING: ['PAUSED'],
  PAUSED: ['RUNNING', 'SCHEDULED', 'STOPPING', 'DISABLED'],
  STOPPING: ['STOPPED'],
  ERROR: ['STOPPED', 'DISABLED'],
  DISABLED: ['STOPPED'],
};

export function canTransition(from: AgentState, to: AgentState): boolean {
  return TRANSITIONS[from].includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: AgentState,
    readonly to: AgentState,
  ) {
    super(`Illegal agent transition ${from} -> ${to}`);
  }
}

export function assertTransition(from: AgentState, to: AgentState): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

// ---- Owner commands -> target states ----

export const OWNER_ACTIONS = [
  'activate',
  'start',
  'pause',
  'resume',
  'stop',
  'disable',
  'enable',
  'acknowledge',
] as const;
export type OwnerAction = (typeof OWNER_ACTIONS)[number];

/**
 * The state an owner command moves the agent to, or null if the command does not apply.
 * `start`/`resume` go to RUNNING inside working hours and SCHEDULED outside them.
 */
export function targetState(action: OwnerAction, from: AgentState, inWorkingHours: boolean): AgentState | null {
  const live: AgentState = inWorkingHours ? 'RUNNING' : 'SCHEDULED';
  const candidates: Record<OwnerAction, AgentState | null> = {
    activate: from === 'DRAFT' ? 'STOPPED' : null,
    start: from === 'STOPPED' ? live : null,
    resume: from === 'PAUSED' ? live : null,
    pause: from === 'RUNNING' || from === 'SCHEDULED' ? 'PAUSING' : null,
    stop: from === 'RUNNING' || from === 'SCHEDULED' || from === 'PAUSED' ? 'STOPPING' : null,
    disable: from === 'STOPPED' || from === 'SCHEDULED' || from === 'PAUSED' || from === 'ERROR' ? 'DISABLED' : null,
    enable: from === 'DISABLED' ? 'STOPPED' : null,
    acknowledge: from === 'ERROR' ? 'STOPPED' : null,
  };
  const to = candidates[action];
  return to && canTransition(from, to) ? to : null;
}

export function allowedActions(from: AgentState): OwnerAction[] {
  return OWNER_ACTIONS.filter((a) => targetState(a, from, true) !== null);
}

/** Only RUNNING agents take jobs (A7: "Worker checks agent state before taking each job"). */
export function mayTakeWork(state: AgentState): boolean {
  return state === 'RUNNING';
}

/** Transitional states finish when the agent has no job in progress. */
export function settledState(state: AgentState): AgentState | null {
  if (state === 'PAUSING') return 'PAUSED';
  if (state === 'STOPPING') return 'STOPPED';
  return null;
}

export const STATE_REASONS = {
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  OUTSIDE_WORKING_HOURS: 'OUTSIDE_WORKING_HOURS',
  WORKING_HOURS: 'WORKING_HOURS',
  JOB_FAILED: 'JOB_FAILED',
  OWNER: 'OWNER',
  STOP_ALL: 'STOP_ALL',
  BUDGET_RESET: 'BUDGET_RESET',
} as const;
