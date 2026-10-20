/**
 * admin/routes/users — privilege-escalation guard (SEC).
 * Extracted from users.ts: shared access-group check used by create/update
 * so an admin cannot grant permissions they do not hold themselves.
 */

import {
  getGroupById, getUserPermissions, getGroupPermissionIds, recordAudit,
} from '../../../admin/admin-db.js';

/** Result of the escalation check for a target access group. */
export type EscalationCheck =
  | { ok: true }
  | { ok: false; reason: 'group-not-found' }
  | { ok: false; reason: 'escalation'; escalatedPermissions: string[] };

/**
 * Validate that the acting user may assign `accessGroupId`:
 * the group must exist and must not carry permissions the actor lacks.
 */
export async function checkGroupEscalation(
  actorUserId: string, accessGroupId: string,
): Promise<EscalationCheck> {
  const group = await getGroupById(accessGroupId);
  if (!group) return { ok: false, reason: 'group-not-found' };

  const creatorPerms = await getUserPermissions(actorUserId);
  const creatorPermSet = new Set(creatorPerms.map(p => p.permissionId));
  const targetPerms = await getGroupPermissionIds(accessGroupId);
  const escalated = targetPerms.filter(p => !creatorPermSet.has(p));
  if (escalated.length > 0) {
    return { ok: false, reason: 'escalation', escalatedPermissions: escalated };
  }
  return { ok: true };
}

/** Audit + respond for a denied create/update due to privilege escalation. */
export async function auditEscalationDenied(
  actor: { userId: string; username: string },
  action: 'CREATE_USER_DENIED' | 'UPDATE_USER_DENIED',
  targetId: string | undefined,
  details: Record<string, unknown>,
): Promise<void> {
  await recordAudit(actor.userId, actor.username, action, 'users', targetId, JSON.stringify(details));
}
