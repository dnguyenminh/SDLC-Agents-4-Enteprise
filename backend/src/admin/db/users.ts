/**
 * admin/db/users.ts — User CRUD operations via DatabaseAdapter async methods.
 * SA4E-50: All functions are async and use getDbAdapter() so they work with
 * both SQLite (sync-under-the-hood) and PostgreSQL.
 */

import * as crypto from 'crypto';
import type { User, UserStatus } from '../types/rbac.types.js';
import { getDbAdapter } from './core.js';
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
  const adapter = getDbAdapter();
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
  const adapter = getDbAdapter();
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
  const adapter = getDbAdapter();
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
  const adapter = getDbAdapter();
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
  const adapter = getDbAdapter();
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
  const adapter = getDbAdapter();
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
  const adapter = getDbAdapter();
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
  const adapter = getDbAdapter();
  const hash = hashPassword(newPassword);
  await adapter.runAsync(
    'UPDATE users SET password_hash = ?, force_password_change = 0 WHERE user_id = ?',
    [hash, userId],
  );
}

/** Record the current timestamp as last_login for a user. */
export async function updateLastLogin(userId: string): Promise<void> {
  const adapter = getDbAdapter();
  await adapter.runAsync(
    'UPDATE users SET last_login = ? WHERE user_id = ?',
    [new Date().toISOString(), userId],
  );
}

/** Update user email address. */
export async function updateUserEmail(userId: string, email: string): Promise<void> {
  const adapter = getDbAdapter();
  await adapter.runAsync('UPDATE users SET email = ? WHERE user_id = ?', [email, userId]);
}

/**
 * Update user details (username, email, access_group_id).
 * @throws Error if username conflicts or group doesn't exist
 */
export async function updateUser(
  userId: string,
  updates: { username?: string; email?: string; accessGroupId?: string }
): Promise<User> {
  const adapter = getDbAdapter();

  // Validate username uniqueness if changing
  if (updates.username) {
    const existing = await adapter.getAsync<{ user_id: string }>(
      'SELECT user_id FROM users WHERE username = ? AND user_id != ?',
      [updates.username, userId],
    );
    if (existing) throw new Error('Username already exists');
  }

  // Validate group exists if changing
  if (updates.accessGroupId) {
    const group = await adapter.getAsync<{ access_group_id: string }>(
      'SELECT access_group_id FROM access_groups WHERE access_group_id = ?',
      [updates.accessGroupId],
    );
    if (!group) throw new Error('Access group not found');
  }

  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.username) { fields.push('username = ?'); params.push(updates.username); }
  if (updates.email !== undefined) { fields.push('email = ?'); params.push(updates.email); }
  if (updates.accessGroupId) { fields.push('access_group_id = ?'); params.push(updates.accessGroupId); }

  if (fields.length === 0) throw new Error('No updates provided');

  params.push(userId);
  await adapter.runAsync(`UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`, params);

  const updated = await getUserById(userId);
  if (!updated) throw new Error('User not found after update');
  return updated;
}

/** Count total active users (used by dashboard stats). */
export async function getUserCount(): Promise<number> {
  const adapter = getDbAdapter();
  const row = await adapter.getAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM users WHERE status = 'ACTIVE'",
  );
  return row?.cnt ?? 0;
}

/** Count users belonging to a specific access group. */
export async function getUserCountByGroup(groupId: string): Promise<number> {
  const adapter = getDbAdapter();
  const row = await adapter.getAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM users WHERE access_group_id = ?', [groupId],
  );
  return row?.cnt ?? 0;
}
