/**
 * admin/db/groups.ts — Access group and permission management.
 * SA4E-50: All functions are async; use getAdminAdapter() for multi-DB support.
 */

import * as crypto from 'crypto';
import type { AccessGroup, GroupPermission } from '../types/rbac.types.js';
import { getAdminAdapter } from './core.js';

/** Parse raw permission rows into typed GroupPermission objects. */
function parsePermRows(
  rows: { permission_id: string; role_data: string }[],
): GroupPermission[] {
  return rows.map(p => ({
    permissionId: p.permission_id,
    roleData: JSON.parse(p.role_data || '{}'),
  }));
}

/** Build AccessGroup from raw DB row + permissions. */
function buildGroup(
  g: Record<string, unknown>,
  perms: GroupPermission[],
): AccessGroup {
  return {
    accessGroupId: g.access_group_id as string,
    accessGroupName: g.access_group_name as string,
    isSystemGroup: !!(g.is_system_group as number),
    permissions: perms,
    createdAt: g.created_at as string,
    updatedAt: g.updated_at as string,
  };
}

/**
 * List all access groups with their permissions.
 * @returns Array of AccessGroup objects ordered by system-first then name
 */
export async function getGroups(): Promise<AccessGroup[]> {
  const adapter = getAdminAdapter();
  const groups = await adapter.allAsync<Record<string, unknown>>(
    'SELECT * FROM access_groups ORDER BY is_system_group DESC, access_group_name ASC',
  );

  return Promise.all(
    groups.map(async g => {
      const permRows = await adapter.allAsync<{ permission_id: string; role_data: string }>(
        'SELECT permission_id, role_data FROM group_permissions WHERE access_group_id = ?',
        [g.access_group_id as string],
      );
      return buildGroup(g, parsePermRows(permRows));
    }),
  );
}

/**
 * Fetch a single access group by ID.
 * @returns AccessGroup or null if not found
 */
export async function getGroupById(groupId: string): Promise<AccessGroup | null> {
  const adapter = getAdminAdapter();
  const g = await adapter.getAsync<Record<string, unknown>>(
    'SELECT * FROM access_groups WHERE access_group_id = ?', [groupId],
  );
  if (!g) return null;

  const permRows = await adapter.allAsync<{ permission_id: string; role_data: string }>(
    'SELECT permission_id, role_data FROM group_permissions WHERE access_group_id = ?',
    [groupId],
  );
  return buildGroup(g, parsePermRows(permRows));
}

/**
 * Create a new access group with the given permissions.
 * @returns Newly created AccessGroup
 */
export async function createGroup(
  name: string,
  permissions: GroupPermission[],
): Promise<AccessGroup> {
  const adapter = getAdminAdapter();
  const id = 'grp-' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  await adapter.runAsync(
    'INSERT INTO access_groups (access_group_id, access_group_name, is_system_group, created_at, updated_at) VALUES (?, ?, 0, ?, ?)',
    [id, name, now, now],
  );

  for (const p of permissions) {
    await adapter.runAsync(
      'INSERT INTO group_permissions (access_group_id, permission_id, role_data) VALUES (?, ?, ?)',
      [id, p.permissionId, JSON.stringify(p.roleData || {})],
    );
  }

  return { accessGroupId: id, accessGroupName: name, isSystemGroup: false, permissions, createdAt: now, updatedAt: now };
}

/**
 * Update a group's name and replace its permissions.
 * @returns Updated AccessGroup
 */
export async function updateGroup(
  groupId: string,
  name: string | undefined,
  permissions: GroupPermission[],
): Promise<AccessGroup> {
  const adapter = getAdminAdapter();
  const existing = await adapter.getAsync<Record<string, unknown>>(
    'SELECT * FROM access_groups WHERE access_group_id = ?', [groupId],
  );
  if (!existing) throw new Error('Group not found');

  const now = new Date().toISOString();
  if (name) {
    await adapter.runAsync(
      'UPDATE access_groups SET access_group_name = ?, updated_at = ? WHERE access_group_id = ?',
      [name, now, groupId],
    );
  } else {
    await adapter.runAsync(
      'UPDATE access_groups SET updated_at = ? WHERE access_group_id = ?',
      [now, groupId],
    );
  }

  await adapter.runAsync(
    'DELETE FROM group_permissions WHERE access_group_id = ?', [groupId],
  );
  for (const p of permissions) {
    await adapter.runAsync(
      'INSERT INTO group_permissions (access_group_id, permission_id, role_data) VALUES (?, ?, ?)',
      [groupId, p.permissionId, JSON.stringify(p.roleData || {})],
    );
  }

  return (await getGroupById(groupId))!;
}

/**
 * Delete an access group. Cannot delete system groups or groups with users.
 * @throws Error if group is a system group or has assigned users
 */
export async function deleteGroup(groupId: string): Promise<void> {
  const adapter = getAdminAdapter();
  const g = await adapter.getAsync<{ is_system_group: number }>(
    'SELECT is_system_group FROM access_groups WHERE access_group_id = ?', [groupId],
  );
  if (!g) throw new Error('Group not found');
  if (g.is_system_group) throw new Error('Cannot delete system group');

  const usersInGroup = await adapter.getAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM users WHERE access_group_id = ?', [groupId],
  );
  if ((usersInGroup?.cnt ?? 0) > 0) throw new Error('Cannot delete group with assigned users');

  await adapter.runAsync('DELETE FROM access_groups WHERE access_group_id = ?', [groupId]);
}

/**
 * Get all permissions for a user via their access group.
 * @returns Array of GroupPermission objects
 */
export async function getUserPermissions(userId: string): Promise<GroupPermission[]> {
  const adapter = getAdminAdapter();
  const user = await adapter.getAsync<{ access_group_id: string }>(
    'SELECT access_group_id FROM users WHERE user_id = ?', [userId],
  );
  if (!user) return [];

  const rows = await adapter.allAsync<{ permission_id: string; role_data: string }>(
    'SELECT permission_id, role_data FROM group_permissions WHERE access_group_id = ?',
    [user.access_group_id],
  );
  return parsePermRows(rows);
}

/**
 * Get just the permission IDs for a group (used for privilege escalation checks).
 * @returns Array of permission ID strings
 */
export async function getGroupPermissionIds(groupId: string): Promise<string[]> {
  const adapter = getAdminAdapter();
  const rows = await adapter.allAsync<{ permission_id: string }>(
    'SELECT permission_id FROM group_permissions WHERE access_group_id = ?', [groupId],
  );
  return rows.map(p => p.permission_id);
}
