import type { Role } from '../generated/prisma/enums';

// Server-side permission map. The UI never decides access (MASTER_SPEC §15).
export const PERMISSIONS = {
  'system.view': ['OWNER', 'STAFF'],
  'audit.view': ['OWNER'],
  'users.manage': ['OWNER'],
  'agents.view': ['OWNER', 'STAFF'],
  'agents.control': ['OWNER'],
  'integrations.manage': ['OWNER'],
  'catalog.view': ['OWNER', 'STAFF'],
  'prices.confirm': ['OWNER'],
  'prospects.view': ['OWNER', 'STAFF'],
  'prospects.edit': ['OWNER', 'STAFF'],
  'orders.view': ['OWNER', 'STAFF'],
  'orders.edit': ['OWNER', 'STAFF'],
  'orders.approve': ['OWNER'],
  'orders.deliver': ['OWNER'],
  'payments.record': ['OWNER'],
  'settings.manage': ['OWNER'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
