import * as crypto from 'crypto';
import type { AccessGroup, GroupPermission } from '../types/rbac.types.js';
import { getAdminDb } from './core.js';

export function getGroups(): AccessGroup[] {
  const d = getAdminDb();
  const groups = d.prepare('SELECT * FROM access_groups ORDER BY is_system_group DESC, access_group_name ASC').all() as Record<string, unknown>[];
  const permStmt = d.prepare('SELECT permission_id, role_data FROM group_permissions WHERE access_group_id = ?');

  return groups.map(g => {
    const perms = permStmt.all(g.access_group_id) as { permission_id: string; role_data: string }[];
    return {
      accessGroupId: g.access_group_id,
      accessGroupName: g.access_group_name,
      isSystemGroup: !!g.is_system_group,
      permissions: perms.map(p => ({ permissionId: p.permission_id, roleData: JSON.parse(p.role_data || '{}') })),
      createdAt: g.created_at,
      updatedAt: g.updated_at,
    };
  });
}

export function getGroupById(groupId: string): AccessGroup | null {
  const d = getAdminDb();
  const g = d.prepare('SELECT * FROM access_groups WHERE access_group_id = ?').get(groupId) as Record<string, unknown> | undefined;
  if (!g) return null;
  const perms = d.prepare('SELECT permission_id, role_data FROM group_permissions WHERE access_group_id = ?').all(groupId) as { permission_id: string; role_data: string }[];
  return {
    accessGroupId: g.access_group_id, accessGroupName: g.access_group_name,
    isSystemGroup: !!g.is_system_group,
    permissions: perms.map(p => ({ permissionId: p.permission_id, roleData: JSON.parse(p.role_data || '{}') })),
    createdAt: g.created_at, updatedAt: g.updated_at,
  };
}

export function createGroup(name: string, permissions: GroupPermission[]): AccessGroup {
  const d = getAdminDb();
  const id = 'grp-' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  d.prepare('INSERT INTO access_groups (access_group_id, access_group_name, is_system_group, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(id, name, now, now);

  const insertPerm = d.prepare('INSERT INTO group_permissions (access_group_id, permission_id, role_data) VALUES (?, ?, ?)');
  for (const p of permissions) {
    insertPerm.run(id, p.permissionId, JSON.stringify(p.roleData || {}));
  }

  return { accessGroupId: id, accessGroupName: name, isSystemGroup: false, permissions, createdAt: now, updatedAt: now };
}

export function updateGroup(groupId: string, name: string | undefined, permissions: GroupPermission[]): AccessGroup {
  const d = getAdminDb();
  const existing = d.prepare('SELECT * FROM access_groups WHERE access_group_id = ?').get(groupId) as Record<string, unknown> | undefined;
  if (!existing) throw new Error('Group not found');

  const now = new Date().toISOString();
  if (name) {
    d.prepare('UPDATE access_groups SET access_group_name = ?, updated_at = ? WHERE access_group_id = ?').run(name, now, groupId);
  } else {
    d.prepare('UPDATE access_groups SET updated_at = ? WHERE access_group_id = ?').run(now, groupId);
  }

  d.prepare('DELETE FROM group_permissions WHERE access_group_id = ?').run(groupId);
  const insertPerm = d.prepare('INSERT INTO group_permissions (access_group_id, permission_id, role_data) VALUES (?, ?, ?)');
  for (const p of permissions) {
    insertPerm.run(groupId, p.permissionId, JSON.stringify(p.roleData || {}));
  }

  return getGroupById(groupId)!;
}

export function deleteGroup(groupId: string): void {
  const d = getAdminDb();
  const g = d.prepare('SELECT is_system_group FROM access_groups WHERE access_group_id = ?').get(groupId) as { is_system_group: number } | undefined;
  if (!g) throw new Error('Group not found');
  if (g.is_system_group) throw new Error('Cannot delete system group');

  const usersInGroup = d.prepare('SELECT COUNT(*) as cnt FROM users WHERE access_group_id = ?').get(groupId) as { cnt: number };
  if (usersInGroup.cnt > 0) throw new Error('Cannot delete group with assigned users');

  d.prepare('DELETE FROM access_groups WHERE access_group_id = ?').run(groupId);
}

export function getUserPermissions(userId: string): GroupPermission[] {
  const d = getAdminDb();
  const user = d.prepare('SELECT access_group_id FROM users WHERE user_id = ?').get(userId) as { access_group_id: string } | undefined;
  if (!user) return [];
  const perms = d.prepare('SELECT permission_id, role_data FROM group_permissions WHERE access_group_id = ?').all(user.access_group_id) as { permission_id: string; role_data: string }[];
  return perms.map(p => ({ permissionId: p.permission_id, roleData: JSON.parse(p.role_data || '{}') }));
}

export function getGroupPermissionIds(groupId: string): string[] {
  const d = getAdminDb();
  const perms = d.prepare('SELECT permission_id FROM group_permissions WHERE access_group_id = ?').all(groupId) as { permission_id: string }[];
  return perms.map(p => p.permission_id);
}
