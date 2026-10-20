/**
 * User write/mutation operations for the admin database.
 * Extracted from admin/db/users.ts (BR-18) — no behavior change.
 */

import * as crypto from 'crypto';
import type { User, UserStatus } from '../../types/rbac.types.js';
import { getDbAdapter } from '../core.js';
import { hashPassword } from '../password.js';
import { invalidateUserSessions } from '../sessions.js';
import { getUserById } from './user-queries.js';

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
    `INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, force_password_change, created_at, account_type)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, 1, ?, 'LOCAL')`,
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
