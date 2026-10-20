/**
 * User read/query operations for the admin database.
 * Extracted from admin/db/users.ts (BR-18) — no behavior change.
 */

import type { User, UserStatus } from '../../types/rbac.types.js';
import { getDbAdapter } from '../core.js';

/** Build user object from raw DB row. */
export function rowToUser(r: Record<string, unknown>): User {
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
