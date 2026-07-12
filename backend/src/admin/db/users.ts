import * as crypto from 'crypto';
import type { User, UserStatus } from '../types/rbac.types.js';
import { getAdminDb } from './core.js';
import { hashPassword } from './password.js';
import { invalidateUserSessions } from './sessions.js';

export function getUsers(filters?: { status?: string; search?: string; accessGroupId?: string }, page = 1, pageSize = 50): { items: any[]; total: number } {
  const d = getAdminDb();
  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (filters?.status) { where += ' AND u.status = ?'; params.push(filters.status); }
  if (filters?.accessGroupId) { where += ' AND u.access_group_id = ?'; params.push(filters.accessGroupId); }
  if (filters?.search) { where += ' AND (u.username LIKE ? OR u.email LIKE ?)'; params.push(`%${filters.search}%`, `%${filters.search}%`); }

  const total = (d.prepare(`SELECT COUNT(*) as cnt FROM users u ${where}`).get(...params) as { cnt: number }).cnt;
  const rows = d.prepare(`SELECT u.*, g.access_group_name FROM users u LEFT JOIN access_groups g ON u.access_group_id = g.access_group_id ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];

  return {
    total,
    items: rows.map(r => ({
      userId: r.user_id as string,
      username: r.username as string,
      email: r.email as string,
      status: r.status as string,
      accessGroupId: r.access_group_id as string,
      accessGroupName: (r.access_group_name as string) || '',
      forcePasswordChange: !!(r.force_password_change as number),
      createdAt: r.created_at as string,
      lastLogin: (r.last_login as string) || undefined,
    })),
  };
}

export function getUserById(userId: string): User | null {
  const d = getAdminDb();
  const r = d.prepare('SELECT * FROM users WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    userId: r.user_id as string, username: r.username as string, email: r.email as string, status: r.status as UserStatus,
    accessGroupId: r.access_group_id as string, forcePasswordChange: !!(r.force_password_change as number),
    createdAt: r.created_at as string, lastLogin: (r.last_login as string) || undefined,
  };
}

export function getUserByUsername(username: string): (User & { passwordHash: string }) | null {
  const d = getAdminDb();
  const r = d.prepare('SELECT * FROM users WHERE username = ?').get(username) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    userId: r.user_id as string, username: r.username as string, email: r.email as string, status: r.status as UserStatus,
    accessGroupId: r.access_group_id as string, forcePasswordChange: !!(r.force_password_change as number),
    createdAt: r.created_at as string, lastLogin: (r.last_login as string) || undefined, passwordHash: r.password_hash as string,
  };
}

export function createUser(username: string, email: string, password: string, accessGroupId: string): User {
  const d = getAdminDb();
  const userId = 'user-' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const hash = hashPassword(password);

  d.prepare(`INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, force_password_change, created_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, 1, ?)`).run(userId, username, email, hash, accessGroupId, now);

  return { userId, username, email, status: 'ACTIVE', accessGroupId, forcePasswordChange: true, createdAt: now };
}

export function updateUserStatus(userId: string, status: UserStatus): number {
  const d = getAdminDb();
  d.prepare('UPDATE users SET status = ? WHERE user_id = ?').run(status, userId);
  if (status === 'DISABLED') {
    return invalidateUserSessions(userId);
  }
  return 0;
}

export function deleteUser(userId: string): void {
  const d = getAdminDb();
  const user = d.prepare('SELECT username FROM users WHERE user_id = ?').get(userId) as { username: string } | undefined;
  if (user?.username === 'admin') throw new Error('Cannot delete system admin');
  invalidateUserSessions(userId);
  d.prepare('DELETE FROM users WHERE user_id = ?').run(userId);
}

export function resetUserPassword(userId: string): string {
  const d = getAdminDb();
  const tempPwd = crypto.randomBytes(6).toString('base64url');
  const hash = hashPassword(tempPwd);
  d.prepare('UPDATE users SET password_hash = ?, force_password_change = 1 WHERE user_id = ?').run(hash, userId);
  return tempPwd;
}

export function changePassword(userId: string, newPassword: string): void {
  const d = getAdminDb();
  const hash = hashPassword(newPassword);
  d.prepare('UPDATE users SET password_hash = ?, force_password_change = 0 WHERE user_id = ?').run(hash, userId);
}

export function updateLastLogin(userId: string): void {
  const d = getAdminDb();
  d.prepare('UPDATE users SET last_login = ? WHERE user_id = ?').run(new Date().toISOString(), userId);
}
