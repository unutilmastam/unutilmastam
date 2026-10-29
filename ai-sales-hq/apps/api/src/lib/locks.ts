import type { Db } from './db';

/**
 * Takes the named lease if it is free or expired. Works across processes (API requests and cron
 * runs) because the row lives in MySQL; no in-memory state (SPEC_AMENDMENTS A2).
 */
export async function acquireLock(db: Db, name: string, holder: string, ttlMs: number, now: Date): Promise<boolean> {
  const until = new Date(now.getTime() + ttlMs);
  const taken = await db.lock.updateMany({
    where: { name, lockedUntil: { lt: now } },
    data: { holder, lockedUntil: until, acquiredAt: now },
  });
  if (taken.count === 1) return true;
  try {
    await db.lock.create({ data: { name, holder, lockedUntil: until, acquiredAt: now } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false; // held by someone else
    throw err;
  }
}

export async function releaseLock(db: Db, name: string, holder: string): Promise<void> {
  await db.lock.deleteMany({ where: { name, holder } });
}
