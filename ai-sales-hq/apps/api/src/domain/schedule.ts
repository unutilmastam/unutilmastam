// Working schedules in the business time zone (Asia/Tashkent, UTC+5, no DST — A8).
// Pure functions over a UTC instant; never the server's local time.

export const TASHKENT_OFFSET_MINUTES = 5 * 60;

export interface Schedule {
  // ISO weekdays 1 = Monday ... 7 = Sunday.
  workingDays: number[];
  // "HH:MM" local time; end is exclusive. start === end means all day.
  startTime: string;
  endTime: string;
}

export const DEFAULT_SCHEDULE: Schedule = { workingDays: [1, 2, 3, 4, 5, 6], startTime: '09:00', endTime: '19:00' };

export interface LocalTime {
  date: string; // YYYY-MM-DD in Tashkent
  isoWeekday: number;
  minutes: number; // minutes since local midnight
}

export function toTashkent(at: Date): LocalTime {
  const local = new Date(at.getTime() + TASHKENT_OFFSET_MINUTES * 60_000);
  const day = local.getUTCDay();
  return {
    date: local.toISOString().slice(0, 10),
    isoWeekday: day === 0 ? 7 : day,
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

export function parseHhMm(value: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) throw new Error(`Invalid time ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function isValidSchedule(s: Schedule): boolean {
  try {
    parseHhMm(s.startTime);
    parseHhMm(s.endTime);
  } catch {
    return false;
  }
  return s.workingDays.length > 0 && s.workingDays.every((d) => Number.isInteger(d) && d >= 1 && d <= 7);
}

/** Supports overnight windows (e.g. 22:00–06:00 belongs to the day it starts on). */
export function isWithinSchedule(s: Schedule, at: Date): boolean {
  const t = toTashkent(at);
  const start = parseHhMm(s.startTime);
  const end = parseHhMm(s.endTime);
  if (start === end) return s.workingDays.includes(t.isoWeekday);
  if (start < end) return s.workingDays.includes(t.isoWeekday) && t.minutes >= start && t.minutes < end;
  if (t.minutes >= start) return s.workingDays.includes(t.isoWeekday);
  if (t.minutes < end) {
    const yesterday = t.isoWeekday === 1 ? 7 : t.isoWeekday - 1;
    return s.workingDays.includes(yesterday);
  }
  return false;
}

/** Start of the current Tashkent day as a UTC instant (daily limits reset here). */
export function startOfTashkentDay(at: Date): Date {
  const t = toTashkent(at);
  return new Date(Date.parse(`${t.date}T00:00:00Z`) - TASHKENT_OFFSET_MINUTES * 60_000);
}
