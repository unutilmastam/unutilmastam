// Virtual office (A13): a pure mapping from persisted facts to what a figure shows.
// An agent is drawn "working" only when it is RUNNING and has an active or very recent job.

import type { AgentState } from './agent-lifecycle';

export type Pose =
  | 'working' // at the desk, screen on, typing
  | 'idle' // RUNNING but nothing to do: at the desk, screen dimmed
  | 'off_hours' // SCHEDULED: outside working hours, desk empty
  | 'paused' // PAUSING/PAUSED: in the lounge
  | 'stopping' // STOPPING: packing up
  | 'error' // ERROR: red alert above the desk
  | 'absent'; // DRAFT/STOPPED/DISABLED: nobody there

export const RECENT_WORK_MS = 2 * 60_000;

export interface OfficeFacts {
  state: AgentState;
  hasRunningJob: boolean;
  lastJobFinishedAt: Date | null;
  now: Date;
}

export function poseFor(f: OfficeFacts): Pose {
  switch (f.state) {
    case 'RUNNING': {
      const recent = f.lastJobFinishedAt !== null && f.now.getTime() - f.lastJobFinishedAt.getTime() < RECENT_WORK_MS;
      return f.hasRunningJob || recent ? 'working' : 'idle';
    }
    case 'SCHEDULED':
      return 'off_hours';
    case 'PAUSING':
    case 'PAUSED':
      return 'paused';
    case 'STOPPING':
      return 'stopping';
    case 'ERROR':
      return 'error';
    default:
      return 'absent';
  }
}
