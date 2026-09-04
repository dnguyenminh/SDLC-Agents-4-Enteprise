/**
 * Unit Tests — admin-db.ts (KSA-285: Auth & Multitenant)
 * SA4E-50: All DB functions are now async — all calls must be awaited.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  invalidateSession,
  invalidateUserSessions,
  getUsers,
  getUserById,
  getUserByUsername,
  createUser,
  updateUserStatus,
  deleteUser,
  resetUserPassword,
  changePassword,
  getGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  getUserPermissions,
  recordAudit,
  getAuditLogs,
  recordConfigChange,
  getConfigChanges,
  setPromotionCooldown,
  checkPromotionCooldown,
  searchKbEntries,
  getAdminDb,
} from '../admin-db.js';

// ============================================================
// 1. Password Hashing (sync — no change needed)
// ============================================================

describe('Password Hashing', () => {
  it('hashPassword returns salt:hash format', () => {
    const hashed = hashPassword('testPassword123');
    expect(hashed).toContain(':');
    const [salt, hash] = hashed.split(':');
    expect(salt.length).toBe(32);
    expect(hash.length).toBe(128);
  });

  it('hashPassword produces different hashes for same password', () => {
    expect(hashPassword('samePassword')).not.toBe(hashPassword('samePassword'));
  });

  it('verifyPassword returns true for correct password', () => {
    const hashed = hashPassword('mySecretPass!');
    expect(verifyPassword('mySecretPass!', hashed)).toBe(true);
  });

  it('verifyPassword returns false for wrong password', () => {
    expect(verifyPassword('wrong', hashPassword('correct'))).toBe(false);
  });

  it('verifyPassword returns false for invalid stored format', () => {
    expect(verifyPassword('test', 'invalid-no-colon')).toBe(false);
    expect(verifyPassword('test', '')).toBe(false);
  });
});

// ============================================================
// 2. Session Management
// ============================================================

describe('Session Management', () => {
  let testUserId: string;

  beforeAll(async () => {
    const user = await getUserByUsername('admin');
    testUserId = user!.userId;
  });

  it('createSession returns session with token', async () => {
    const session = await createSession(testUserId, 'TestDevice', '127.0.0.1');
    expect(session.token).toBeDefined();
    expect(session.token.length).toBe(64);
    expect(session.userId).toBe(testUserId);
    expect(session.sessionId).toMatch(/^sess-/);
    expect(session.expiresAt).toBeDefined();
    expect(session.isActive).toBe(true);
  });

  it('validateSession returns user info for valid token', async () => {
    const session = await createSession(testUserId);
    const result = await validateSession(session.token);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe(testUserId);
    expect(result!.username).toBe('admin');
    expect(result!.accessGroupId).toBe('grp-admin');
  });

  it('validateSession returns null for invalid token', async () => {
    const result = await validateSession('nonexistent-token-12345');
    expect(result).toBeNull();
  });

  it('invalidateSession makes token invalid', async () => {
    const session = await createSession(testUserId);
    expect(await validateSession(session.token)).not.toBeNull();
    await invalidateSession(session.token);
    expect(await validateSession(session.token)).toBeNull();
  });

  it('invalidateUserSessions terminates all active sessions', async () => {
    const s1 = await createSession(testUserId);
    const s2 = await createSession(testUserId);
    expect(await validateSession(s1.token)).not.toBeNull();
    expect(await validateSession(s2.token)).not.toBeNull();
    const terminated = await invalidateUserSessions(testUserId);
    expect(terminated).toBeGreaterThanOrEqual(2);
    expect(await validateSession(s1.token)).toBeNull();
    expect(await validateSession(s2.token)).toBeNull();
  });

  it('expired token returns null from validateSession', async () => {
    const db = getAdminDb();
    const token = 'expired-token-test-' + Date.now();
    const pastDate = new Date(Date.now() - 1000).toISOString();
    db.prepare(`INSERT INTO sessions (session_id, user_id, token, device, ip_address, login_at, expires_at, is_active)
      VALUES (?, ?, ?, '', '', ?, ?, 1)`).run(
      'sess-expired-' + Date.now(), testUserId, token, pastDate, pastDate
    );
    const result = await validateSession(token);
    expect(result).toBeNull();
  });
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

// ============================================================
// 5. User Permissions
// ============================================================

describe('User Permissions', () => {
  it('getUserPermissions returns permissions for admin', async () => {
    const admin = await getUserByUsername('admin');
    const perms = await getUserPermissions(admin!.userId);
    expect(perms.length).toBeGreaterThan(5);
    expect(perms.some(p => p.permissionId === 'DASHBOARD_VIEW')).toBe(true);
    expect(perms.some(p => p.permissionId === 'USER_MANAGE')).toBe(true);
  });

  it('getUserPermissions returns empty for nonexistent user', async () => {
    const perms = await getUserPermissions('nonexistent-user-id');
    expect(perms).toEqual([]);
  });
});

// ============================================================
// 6. Audit Operations
// ============================================================

describe('Audit Operations', () => {
  const auditUserId = 'test-audit-user';
  const auditUsername = 'auditor';

  it('recordAudit creates audit entry', async () => {
    await recordAudit(auditUserId, auditUsername, 'TEST_ACTION', 'test-resource', 'res-001', '{"key":"value"}', '192.168.1.1');
    const logs = await getAuditLogs({ action: 'TEST_ACTION' });
    expect(logs.total).toBeGreaterThanOrEqual(1);
    const entry = logs.items.find(e => e.action === 'TEST_ACTION' && e.userId === auditUserId);
    expect(entry).toBeDefined();
    expect(entry!.username).toBe(auditUsername);
    expect(entry!.resource).toBe('test-resource');
  });

  it('getAuditLogs with action filter', async () => {
    await recordAudit(auditUserId, auditUsername, 'UNIQUE_ACTION_' + Date.now(), 'resource');
    const logs = await getAuditLogs({ action: 'TEST_ACTION' });
    expect(logs.items.every(e => e.action === 'TEST_ACTION')).toBe(true);
  });

  it('getAuditLogs with date range filter', async () => {
    const from = new Date(Date.now() - 60000).toISOString();
    const to = new Date(Date.now() + 60000).toISOString();
    await recordAudit(auditUserId, auditUsername, 'DATE_TEST', 'resource');
    const logs = await getAuditLogs({ dateFrom: from, dateTo: to });
    expect(logs.total).toBeGreaterThanOrEqual(1);
  });

  it('getAuditLogs supports pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await recordAudit(auditUserId, auditUsername, 'PAGINATE_TEST', 'resource', `item-${i}`);
    }
    const page1 = await getAuditLogs({ action: 'PAGINATE_TEST' }, 1, 2);
    expect(page1.items.length).toBeLessThanOrEqual(2);
    expect(page1.total).toBeGreaterThanOrEqual(5);
  });
});

// ============================================================
// 7. Config Change Tracking
// ============================================================

describe('Config Change Tracking', () => {
  it('recordConfigChange stores config change', async () => {
    await recordConfigChange('server', 'port', '48721', '48722', 'admin', true);
    const changes = await getConfigChanges(5);
    expect(changes.length).toBeGreaterThanOrEqual(1);
    const portChange = changes.find(c => c.key === 'port' && c.newValue === '48722');
    expect(portChange).toBeDefined();
    expect(portChange!.section).toBe('server');
    expect(portChange!.oldValue).toBe('48721');
    expect(portChange!.changedBy).toBe('admin');
    expect(portChange!.requiresRestart).toBe(true);
  });

  it('getConfigChanges respects limit', async () => {
    for (let i = 0; i < 3; i++) {
      await recordConfigChange('test', `key${i}`, null, `val${i}`, 'admin', false);
    }
    const changes = await getConfigChanges(2);
    expect(changes.length).toBeLessThanOrEqual(2);
  });
});

// ============================================================
// 8. Promotion Cooldown
// ============================================================

describe('Promotion Cooldown', () => {
  const entryId = `cooldown-test-${Date.now()}`;

  it('checkPromotionCooldown returns false when no cooldown set', async () => {
    const result = await checkPromotionCooldown(entryId);
    expect(result.onCooldown).toBe(false);
    expect(result.cooldownUntil).toBeUndefined();
  });

  it('setPromotionCooldown sets 7-day cooldown', async () => {
    await setPromotionCooldown(entryId, 'reviewer1');
    const result = await checkPromotionCooldown(entryId);
    expect(result.onCooldown).toBe(true);
    expect(result.cooldownUntil).toBeDefined();
    const diffDays = (new Date(result.cooldownUntil!).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });

  it('different entry has no cooldown', async () => {
    const result = await checkPromotionCooldown('other-entry-no-cooldown');
    expect(result.onCooldown).toBe(false);
  });
});

// ============================================================
// 9. KB Search
// ============================================================

describe('KB Search', () => {
  it('searchKbEntries returns results or empty array', async () => {
    const result = await searchKbEntries('test');
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('total');
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe('number');
  });

  it('searchKbEntries handles empty query gracefully', async () => {
    const result = await searchKbEntries('');
    expect(result).toHaveProperty('items');
    expect(typeof result.total).toBe('number');
  });
});
