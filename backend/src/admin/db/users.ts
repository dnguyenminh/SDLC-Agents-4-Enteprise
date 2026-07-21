/**
 * admin/db/users.ts — User CRUD operations via DatabaseAdapter async methods.
 * SA4E-50: All functions are async and use getAdminAdapter() so they work with
 * both SQLite (sync-under-the-hood) and PostgreSQL.
 */

import * as crypto from 'crypto';
import type { User, UserStatus } from '../types/rbac.types.js';
import { getAdminAdapter } from './core.js';
import { hashPassword } from './password.js';
import { invalidateUserSessions } from './sessions.js';

/** Build user object from raw DB row. */
function rowToUser(r: Record<string, unknown>): User {
  return {
    userId: r.user_id as string,
    username: r.username as string,
    email: r.email as string,
    status: r.status as UserStatus,
    accessGroupId: r.access_group_id as string,
    forcePasswordChange: !!(r.force_password_change as number),
    createdAt: r.created_at as string,
    lastLogin: (r.last_login as string) || undefined,
  };
}

/**
 * List users with optional filters and pagination.
 * @param filters - Optional status/search/group filters
 * @param page - 1-based page number
 * @param pageSize - Records per page
 */
export async function getUsers(
  filters?: { status?: string; search?: string; accessGroupId?: string },
  page = 1,
  pageSize = 50,
): Promise<{ items: any[]; total: number }> {
  const adapter = getAdminAdapter();
  let where = 'WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.status) { where += ' AND u.status = ?'; params.push(filters.status); }
  if (filters?.accessGroupId) { where += ' AND u.access_group_id = ?'; params.push(filters.accessGroupId); }
  if (filters?.search) {
    where += ' AND (u.username LIKE ? OR u.email LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const countRow = await adapter.getAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM users u ${where}`, params,
  );
  const total = countRow?.cnt ?? 0;

  const rows = await adapter.allAsync<Record<string, unknown>>(
    `SELECT u.*, g.access_group_name FROM users u
     LEFT JOIN access_groups g ON u.access_group_id = g.access_group_id
     ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );

  return {
    total,
    items: rows.map(r => ({
      ...rowToUser(r),
      accessGroupName: (r.access_group_name as string) || '',
    })),
  };
}

/**
 * Fetch a single user by ID.
 * @returns User or null if not found
 */
export async function getUserById(userId: string): Promise<User | null> {
  const adapter = getAdminAdapter();
  const r = await adapter.getAsync<Record<string, unknown>>(
    'SELECT * FROM users WHERE user_id = ?', [userId],
  );
  return r ? rowToUser(r) : null;
}

/**
 * Fetch a user with password hash for authentication.
 * @returns User + passwordHash or null
 */
export async function getUserByUsername(
  username: string,
): Promise<(User & { passwordHash: string }) | null> {
  const adapter = getAdminAdapter();
  const r = await adapter.getAsync<Record<string, unknown>>(
    'SELECT * FROM users WHERE username = ?', [username],
  );
  if (!r) return null;
  return { ...rowToUser(r), passwordHash: r.password_hash as string };
}

/**
 * Create a new user with a hashed password.
 * @returns Newly created User object
 */
export async function createUser(
  username: string,
  email: string,
  password: string,
  accessGroupId: string,
): Promise<User> {
  const adapter = getAdminAdapter();
  const userId = 'user-' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const hash = hashPassword(password);

  await adapter.runAsync(
    `INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, force_password_change, created_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, 1, ?)`,
    [userId, username, email, hash, accessGroupId, now],
  );

  return { userId, username, email, status: 'ACTIVE', accessGroupId, forcePasswordChange: true, createdAt: now };
}

/**
 * Update user status. Invalidates sessions on DISABLED.
 * @returns Number of sessions terminated
 */
export async function updateUserStatus(userId: string, status: UserStatus): Promise<number> {
  const adapter = getAdminAdapter();
  await adapter.runAsync('UPDATE users SET status = ? WHERE user_id = ?', [status, userId]);
  if (status === 'DISABLED') {
    return invalidateUserSessions(userId);
  }
  return 0;
}

/**
 * Delete a user. Cannot delete the system admin.
 * @throws Error if user is admin or not found
 */
export async function deleteUser(userId: string): Promise<void> {
  const adapter = getAdminAdapter();
  const user = await adapter.getAsync<{ username: string }>(
    'SELECT username FROM users WHERE user_id = ?', [userId],
  );
  if (user?.username === 'admin') throw new Error('Cannot delete system admin');
  await invalidateUserSessions(userId);
  await adapter.runAsync('DELETE FROM users WHERE user_id = ?', [userId]);
}

/**
 * Generate a temporary password and force password change on next login.
 * @returns Plain-text temporary password
 */
export async function resetUserPassword(userId: string): Promise<string> {
  const adapter = getAdminAdapter();
  const tempPwd = crypto.randomBytes(6).toString('base64url');
  const hash = hashPassword(tempPwd);
  await adapter.runAsync(
    'UPDATE users SET password_hash = ?, force_password_change = 1 WHERE user_id = ?',
    [hash, userId],
  );
  return tempPwd;
}

/**
 * Change a user's password and clear the force_password_change flag.
 */
export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const adapter = getAdminAdapter();
  const hash = hashPassword(newPassword);
  await adapter.runAsync(
    'UPDATE users SET password_hash = ?, force_password_change = 0 WHERE user_id = ?',
    [hash, userId],
  );
}

/** Record the current timestamp as last_login for a user. */
export async function updateLastLogin(userId: string): Promise<void> {
  const adapter = getAdminAdapter();
  await adapter.runAsync(
    'UPDATE users SET last_login = ? WHERE user_id = ?',
    [new Date().toISOString(), userId],
  );
}

/** Update user email address. */
export async function updateUserEmail(userId: string, email: string): Promise<void> {
  const adapter = getAdminAdapter();
  await adapter.runAsync('UPDATE users SET email = ? WHERE user_id = ?', [email, userId]);
}

/** Count total active users (used by dashboard stats). */
export async function getUserCount(): Promise<number> {
  const adapter = getAdminAdapter();
  const row = await adapter.getAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM users WHERE status = 'ACTIVE'",
  );
  return row?.cnt ?? 0;
}

/** Count users belonging to a specific access group. */
export async function getUserCountByGroup(groupId: string): Promise<number> {
  const adapter = getAdminAdapter();
  const row = await adapter.getAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM users WHERE access_group_id = ?', [groupId],
  );
  return row?.cnt ?? 0;
}
