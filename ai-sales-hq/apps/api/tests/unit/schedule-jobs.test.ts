import { describe, expect, it } from 'vitest';
import { backoffSeconds, nextAfterFailure } from '../../src/domain/jobs';
import { isValidSchedule, isWithinSchedule, startOfTashkentDay, toTashkent } from '../../src/domain/schedule';

const at = (iso: string) => new Date(iso);

describe('Tashkent time', () => {
  it('converts UTC to local (UTC+5)', () => {
    expect(toTashkent(at('2026-10-28T19:30:00Z'))).toEqual({ date: '2026-10-29', isoWeekday: 4, minutes: 30 });
    expect(startOfTashkentDay(at('2026-10-28T19:30:00Z')).toISOString()).toBe('2026-10-28T19:00:00.000Z');
  });
});

describe('isWithinSchedule', () => {
  const weekdays = { workingDays: [1, 2, 3, 4, 5, 6], startTime: '09:00', endTime: '19:00' };
  it('day window, local time', () => {
    expect(isWithinSchedule(weekdays, at('2026-10-28T04:00:00Z'))).toBe(true); // Wed 09:00
    expect(isWithinSchedule(weekdays, at('2026-10-28T03:59:00Z'))).toBe(false); // Wed 08:59
    expect(isWithinSchedule(weekdays, at('2026-10-28T14:00:00Z'))).toBe(false); // Wed 19:00 (end exclusive)
    expect(isWithinSchedule(weekdays, at('2026-11-01T06:00:00Z'))).toBe(false); // Sunday
  });
  it('overnight window belongs to the start day', () => {
    const night = { workingDays: [6], startTime: '22:00', endTime: '06:00' };
    expect(isWithinSchedule(night, at('2026-10-31T18:00:00Z'))).toBe(true); // Sat 23:00
    expect(isWithinSchedule(night, at('2026-10-31T23:00:00Z'))).toBe(true); // Sun 04:00
    expect(isWithinSchedule(night, at('2026-11-01T18:00:00Z'))).toBe(false); // Sun 23:00
  });
  it('validates', () => {
    expect(isValidSchedule({ workingDays: [1], startTime: '9:00', endTime: '18:00' })).toBe(false);
    expect(isValidSchedule({ workingDays: [], startTime: '09:00', endTime: '18:00' })).toBe(false);
    expect(isValidSchedule({ workingDays: [8], startTime: '09:00', endTime: '18:00' })).toBe(false);
    expect(isValidSchedule({ workingDays: [7], startTime: '00:00', endTime: '00:00' })).toBe(true);
  });
});

describe('retry policy', () => {
  it('backs off exponentially with a cap and never loops forever', () => {
    expect([1, 2, 3, 4].map(backoffSeconds)).toEqual([30, 60, 120, 240]);
    expect(backoffSeconds(50)).toBe(6 * 3600);
    expect(nextAfterFailure(1, 5, false)).toEqual({ status: 'QUEUED', delaySeconds: 30 });
    expect(nextAfterFailure(5, 5, false)).toEqual({ status: 'DEAD' });
    expect(nextAfterFailure(1, 5, true)).toEqual({ status: 'DEAD' });
  });
});
