import * as crypto from 'crypto';
import type { Session } from '../types/rbac.types.js';
import { getAdminDb } from './core.js';
import { generateToken } from './password.js';

export function createSession(userId: string, device?: string, ip?: string): Session & { token: string } {
  const d = getAdminDb();
  const sessionId = 'sess-' + crypto.randomUUID().slice(0, 8);
  const token = generateToken();
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  d.prepare(`INSERT INTO sessions (session_id, user_id, token, device, ip_address, login_at, expires_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).run(
    sessionId, userId, token, device || '', ip || '', now.toISOString(), expires.toISOString()
  );

  return { sessionId, userId, token, device, ipAddress: ip, loginAt: now.toISOString(), expiresAt: expires.toISOString(), isActive: true };
}

export function validateSession(token: string): { userId: string; username: string; accessGroupId: string } | null {
  const d = getAdminDb();
  const row = d.prepare(`
    SELECT s.user_id, s.expires_at, s.is_active, u.username, u.access_group_id, u.status
    FROM sessions s JOIN users u ON s.user_id = u.user_id
    WHERE s.token = ?
  `).get(token) as { user_id: string; expires_at: string; is_active: number; username: string; access_group_id: string; status: string } | undefined;

  if (!row) return null;
  if (!row.is_active) return null;
  if (row.status !== 'ACTIVE') return null;
  if (new Date(row.expires_at) < new Date()) {
    d.prepare('UPDATE sessions SET is_active = 0 WHERE token = ?').run(token);
    return null;
  }

  return { userId: row.user_id, username: row.username, accessGroupId: row.access_group_id };
}

export function invalidateSession(token: string): void {
  const d = getAdminDb();
  d.prepare('UPDATE sessions SET is_active = 0 WHERE token = ?').run(token);
}

export function invalidateUserSessions(userId: string): number {
  const d = getAdminDb();
  const result = d.prepare('UPDATE sessions SET is_active = 0 WHERE user_id = ? AND is_active = 1').run(userId);
  return result.changes;
}

export function refreshSession(token: string): { token: string; expiresAt: string } | null {
  const d = getAdminDb();
  const row = d.prepare(`
    SELECT s.user_id, s.expires_at, s.is_active, u.status
    FROM sessions s JOIN users u ON s.user_id = u.user_id
    WHERE s.token = ?
  `).get(token) as { user_id: string; expires_at: string; is_active: number; status: string } | undefined;

  if (!row) return null;
  if (!row.is_active) return null;
  if (row.status !== 'ACTIVE') return null;

  if (new Date(row.expires_at) < new Date()) {
    d.prepare('UPDATE sessions SET is_active = 0 WHERE token = ?').run(token);
    return null;
  }

  const newToken = generateToken();
  const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  d.prepare('UPDATE sessions SET token = ?, expires_at = ? WHERE token = ?').run(newToken, newExpires, token);

  return { token: newToken, expiresAt: newExpires };
}

export function getUserSessions(userId: string): Session[] {
  const d = getAdminDb();
  const rows = d.prepare('SELECT * FROM sessions WHERE user_id = ? AND is_active = 1 ORDER BY login_at DESC').all(userId) as Record<string, unknown>[];
  return rows.map(r => ({
    sessionId: r.session_id, userId: r.user_id,
    device: r.device, ipAddress: r.ip_address, loginAt: r.login_at,
    expiresAt: r.expires_at, isActive: !!r.is_active,
  }));
}
