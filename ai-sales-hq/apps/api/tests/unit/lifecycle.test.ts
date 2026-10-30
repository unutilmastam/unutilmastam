import { describe, expect, it } from 'vitest';
import {
  AGENT_STATES,
  type AgentState,
  allowedActions,
  assertTransition,
  canTransition,
  IllegalTransitionError,
  mayTakeWork,
  settledState,
  targetState,
} from '../../src/domain/agent-lifecycle';

// The table from SPEC_AMENDMENTS A7, written out independently of the implementation.
const A7: Record<AgentState, AgentState[]> = {
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

describe('A7 transition table', () => {
  for (const from of AGENT_STATES) {
    for (const to of AGENT_STATES) {
      const legal = A7[from].includes(to);
      it(`${from} -> ${to} is ${legal ? 'allowed' : 'refused'}`, () => {
        expect(canTransition(from, to)).toBe(legal);
        if (legal) expect(() => assertTransition(from, to)).not.toThrow();
        else expect(() => assertTransition(from, to)).toThrow(IllegalTransitionError);
      });
    }
  }
});

describe('owner commands', () => {
  it('start/resume depend on working hours', () => {
    expect(targetState('start', 'STOPPED', true)).toBe('RUNNING');
    expect(targetState('start', 'STOPPED', false)).toBe('SCHEDULED');
    expect(targetState('resume', 'PAUSED', false)).toBe('SCHEDULED');
  });
  it('re-enable never auto-starts', () => {
    expect(targetState('enable', 'DISABLED', true)).toBe('STOPPED');
  });
  it('a running agent must be stopped before it can be disabled', () => {
    expect(targetState('disable', 'RUNNING', true)).toBeNull();
    expect(allowedActions('RUNNING')).toEqual(['pause', 'stop']);
  });
  it('error needs acknowledgement', () => {
    expect(allowedActions('ERROR')).toEqual(['disable', 'acknowledge']);
    expect(targetState('start', 'ERROR', true)).toBeNull();
  });
  it('every allowed action is a legal transition', () => {
    for (const from of AGENT_STATES) {
      for (const action of allowedActions(from)) {
        const to = targetState(action, from, true);
        expect(to && canTransition(from, to)).toBeTruthy();
      }
    }
  });
  it('only RUNNING takes work; transitional states settle', () => {
    expect(AGENT_STATES.filter(mayTakeWork)).toEqual(['RUNNING']);
    expect(settledState('PAUSING')).toBe('PAUSED');
    expect(settledState('STOPPING')).toBe('STOPPED');
    expect(settledState('RUNNING')).toBeNull();
  });
});
