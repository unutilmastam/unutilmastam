import type { Db } from '../lib/db';

export type Actor =
  | { type: 'user'; id: string }
  | { type: 'system'; id?: string }
  | { type: 'worker'; id?: string }
  | { type: 'anonymous' };

export interface AuditEntry {
  actor: Actor;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

const SECRET_KEYS = /pass|secret|token|code|key|cookie/i;

/** Drops values whose key suggests a credential; audit rows are kept forever. */
export function scrubDetails(details: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(details).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[REDACTED]' : v]));
}

type AuditWriter = Pick<Db, 'auditLog'>;

export async function writeAudit(db: AuditWriter, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorType: entry.actor.type,
      actorId: 'id' in entry.actor ? (entry.actor.id ?? null) : null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      details: entry.details ? (scrubDetails(entry.details) as object) : undefined,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}
