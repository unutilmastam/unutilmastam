import type { Db } from '../../lib/db';

export interface NewNotification {
  kind: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string;
  link?: string;
  dedupeKey?: string;
}

/** In-app notification; with a dedupeKey an unread notification of the same key is refreshed instead. */
export async function notify(db: Db, n: NewNotification, now = new Date()): Promise<void> {
  if (n.dedupeKey) {
    const existing = await db.notification.findFirst({ where: { dedupeKey: n.dedupeKey, readAt: null } });
    if (existing) {
      await db.notification.update({
        where: { id: existing.id },
        data: { title: n.title, body: n.body, severity: n.severity, createdAt: now },
      });
      return;
    }
  }
  await db.notification.create({
    data: {
      kind: n.kind,
      severity: n.severity,
      title: n.title,
      body: n.body,
      link: n.link ?? null,
      dedupeKey: n.dedupeKey ?? null,
      createdAt: now,
    },
  });
}

/** Marks every unread notification with this key as read (e.g. the problem was fixed). */
export async function resolveNotification(db: Db, dedupeKey: string, now = new Date()): Promise<void> {
  await db.notification.updateMany({ where: { dedupeKey, readAt: null }, data: { readAt: now } });
}
