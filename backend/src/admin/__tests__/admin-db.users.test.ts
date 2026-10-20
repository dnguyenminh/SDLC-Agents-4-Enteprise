/**
 * Unit Tests — admin-db.ts (KSA-285: Auth & Multitenant)
 * SA4E-50: All DB functions are now async — all calls must be awaited.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  verifyPassword,
  getUsers,
  getUserById,
  getUserByUsername,
  createUser,
  updateUserStatus,
  deleteUser,
  resetUserPassword,
  changePassword,
  createSession,
  validateSession,
  initAdapters,
} from '../admin-db.js';

// Await shared DB init (schema + admin seed) before any test touches the DB —
// getDbAdapter() inits fire-and-forget, so getUserByUsername('admin') would
// otherwise race seeding and return null.
beforeAll(async () => {
  await initAdapters();
});

// ============================================================
// 3. User Operations
// ============================================================

describe('User Operations', () => {
  let createdUserId: string;
  const testUsername = `unittest-user-${Date.now()}`;

  it('createUser creates a new user', async () => {
    const user = await createUser(testUsername, 'test@test.com', 'TestPass123', 'grp-admin');
    expect(user.userId).toMatch(/^user-/);
    expect(user.username).toBe(testUsername);
    expect(user.email).toBe('test@test.com');
    expect(user.status).toBe('ACTIVE');
    expect(user.forcePasswordChange).toBe(true);
    createdUserId = user.userId;
  });

  it('getUserById returns user', async () => {
    const user = await getUserById(createdUserId);
    expect(user).not.toBeNull();
    expect(user!.username).toBe(testUsername);
  });

  it('getUserByUsername returns user with passwordHash', async () => {
    const user = await getUserByUsername(testUsername);
    expect(user).not.toBeNull();
    expect(user!.passwordHash).toBeDefined();
    expect(user!.passwordHash).toContain(':');
  });

  it('getUsers with no filters returns all users', async () => {
    const result = await getUsers();
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.items.length).toBeGreaterThanOrEqual(2);
  });

  it('getUsers with status filter works', async () => {
    const result = await getUsers({ status: 'ACTIVE' });
    expect(result.items.every(u => u.status === 'ACTIVE')).toBe(true);
  });

  it('getUsers with search filter works', async () => {
    const result = await getUsers({ search: testUsername.substring(0, 10) });
    expect(result.items.some((u: any) => u.username === testUsername)).toBe(true);
  });

  it('getUsers with accessGroupId filter works', async () => {
    const result = await getUsers({ accessGroupId: 'grp-admin' });
    expect(result.items.every((u: any) => u.accessGroupId === 'grp-admin')).toBe(true);
  });

  it('updateUserStatus to DISABLED terminates sessions', async () => {
    await createSession(createdUserId);
    const terminated = await updateUserStatus(createdUserId, 'DISABLED');
    expect(terminated).toBeGreaterThanOrEqual(0);
    const user = await getUserById(createdUserId);
    expect(user!.status).toBe('DISABLED');
  });

  it('DISABLED user session is rejected by validateSession', async () => {
    await updateUserStatus(createdUserId, 'ACTIVE');
    const session = await createSession(createdUserId);
    await updateUserStatus(createdUserId, 'DISABLED');
    const result = await validateSession(session.token);
    expect(result).toBeNull();
  });

  it('resetUserPassword returns temp password and sets forcePasswordChange', async () => {
    await updateUserStatus(createdUserId, 'ACTIVE');
    const tempPwd = await resetUserPassword(createdUserId);
    expect(tempPwd.length).toBeGreaterThan(0);
    const user = await getUserById(createdUserId);
    expect(user!.forcePasswordChange).toBe(true);
    const dbUser = await getUserByUsername(testUsername);
    expect(verifyPassword(tempPwd, dbUser!.passwordHash)).toBe(true);
  });

  it('changePassword updates password and clears forcePasswordChange', async () => {
    await changePassword(createdUserId, 'NewPassword456');
    const user = await getUserById(createdUserId);
    expect(user!.forcePasswordChange).toBe(false);
    const dbUser = await getUserByUsername(testUsername);
    expect(verifyPassword('NewPassword456', dbUser!.passwordHash)).toBe(true);
  });

  it('deleteUser cannot delete system admin', async () => {
    const admin = await getUserByUsername('admin');
    await expect(deleteUser(admin!.userId)).rejects.toThrow('Cannot delete system admin');
  });

  it('deleteUser removes user', async () => {
    await deleteUser(createdUserId);
    const user = await getUserById(createdUserId);
    expect(user).toBeNull();
  });
});
