import { describe, expect, it } from 'vitest';
import { AGENT_STATES } from '../../src/domain/agent-lifecycle';
import { poseFor } from '../../src/domain/office';

const now = new Date('2026-10-28T05:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('office pose (A13: working only with real work)', () => {
  it('RUNNING with an active or recent job is working, otherwise idle', () => {
    expect(poseFor({ state: 'RUNNING', hasRunningJob: true, lastJobFinishedAt: null, now })).toBe('working');
    expect(poseFor({ state: 'RUNNING', hasRunningJob: false, lastJobFinishedAt: ago(60_000), now })).toBe('working');
    expect(poseFor({ state: 'RUNNING', hasRunningJob: false, lastJobFinishedAt: ago(3 * 60_000), now })).toBe('idle');
    expect(poseFor({ state: 'RUNNING', hasRunningJob: false, lastJobFinishedAt: null, now })).toBe('idle');
  });

  it('no other state is ever drawn as working', () => {
    for (const state of AGENT_STATES.filter((s) => s !== 'RUNNING')) {
      expect(poseFor({ state, hasRunningJob: true, lastJobFinishedAt: now, now })).not.toBe('working');
    }
  });

  it('maps the remaining states', () => {
    const p = (state: (typeof AGENT_STATES)[number]) =>
      poseFor({ state, hasRunningJob: false, lastJobFinishedAt: null, now });
    expect([
      p('SCHEDULED'),
      p('PAUSED'),
      p('PAUSING'),
      p('STOPPING'),
      p('ERROR'),
      p('STOPPED'),
      p('DRAFT'),
      p('DISABLED'),
    ]).toEqual(['off_hours', 'paused', 'paused', 'stopping', 'error', 'absent', 'absent', 'absent']);
  });
});
