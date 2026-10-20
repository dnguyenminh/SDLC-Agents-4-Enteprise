/**
 * Unit Tests — admin-db.ts (KSA-285: Auth & Multitenant)
 * SA4E-50: All DB functions are now async — all calls must be awaited.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  getGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  createUser,
  deleteUser,
  initAdapters,
} from '../admin-db.js';

// Await shared DB init (schema + admin seed) before any test touches the DB —
// getDbAdapter() inits fire-and-forget, so getUserByUsername('admin') would
// otherwise race seeding and return null.
beforeAll(async () => {
  await initAdapters();
});

// ============================================================
// 4. RBAC Group Operations
// ============================================================

describe('RBAC Group Operations', () => {
  let testGroupId: string;
  const groupName = `test-group-${Date.now()}`;

  it('createGroup creates a new group with permissions', async () => {
    const group = await createGroup(groupName, [
      { permissionId: 'KB_READ', roleData: {} },
      { permissionId: 'DASHBOARD_VIEW', roleData: {} },
    ]);
    expect(group.accessGroupId).toMatch(/^grp-/);
    expect(group.accessGroupName).toBe(groupName);
    expect(group.isSystemGroup).toBe(false);
    expect(group.permissions).toHaveLength(2);
    testGroupId = group.accessGroupId;
  });

  it('getGroups returns all groups', async () => {
    const groups = await getGroups();
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const found = groups.find(g => g.accessGroupId === testGroupId);
    expect(found).toBeDefined();
  });

  it('getGroupById returns specific group', async () => {
    const group = await getGroupById(testGroupId);
    expect(group).not.toBeNull();
    expect(group!.accessGroupName).toBe(groupName);
    expect(group!.permissions).toHaveLength(2);
  });

  it('updateGroup changes name and permissions', async () => {
    const updated = await updateGroup(testGroupId, 'renamed-group', [
      { permissionId: 'KB_READ', roleData: {} },
      { permissionId: 'KB_WRITE', roleData: {} },
      { permissionId: 'SEARCH_EXPLORE', roleData: { maxResults: 100 } },
    ]);
    expect(updated.accessGroupName).toBe('renamed-group');
    expect(updated.permissions).toHaveLength(3);
  });

  it('deleteGroup cannot delete system group', async () => {
    await expect(deleteGroup('grp-admin')).rejects.toThrow('Cannot delete system group');
  });

  it('deleteGroup cannot delete group with users', async () => {
    const user = await createUser(`grp-test-user-${Date.now()}`, '', 'pass123', testGroupId);
    await expect(deleteGroup(testGroupId)).rejects.toThrow('Cannot delete group with assigned users');
    await deleteUser(user.userId);
  });

  it('deleteGroup removes empty group', async () => {
    await deleteGroup(testGroupId);
    const group = await getGroupById(testGroupId);
    expect(group).toBeNull();
  });
});
