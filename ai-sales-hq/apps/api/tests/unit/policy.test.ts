import { describe, expect, it } from 'vitest';
import { passwordProblem } from '../../src/domain/password-policy';
import { can, PERMISSIONS } from '../../src/domain/permissions';

describe('permissions', () => {
  it('owner can do everything', () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(can('OWNER', p)).toBe(true);
  });
  it('staff cannot approve, deliver, record payments or control agents', () => {
    for (const p of [
      'orders.approve',
      'orders.deliver',
      'payments.record',
      'agents.control',
      'users.manage',
    ] as const) {
      expect(can('STAFF', p)).toBe(false);
    }
    expect(can('STAFF', 'prospects.edit')).toBe(true);
  });
});

describe('password policy', () => {
  it.each([
    ['short1', 'owner', true],
    ['1234567890123', 'owner', true],
    ['owner-password-1', 'owner', true],
    ['aaaaaaaaaaaa', 'owner', true],
    ['Qovun-Termiz-2026', 'owner', false],
  ])('%s', (pw, user, bad) => {
    expect(passwordProblem(pw, user) !== null).toBe(bad);
  });
});
