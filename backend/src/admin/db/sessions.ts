/**
 * admin/db/sessions.ts — Session management via DatabaseAdapter async methods.
 * SA4E-50: All functions are async; use getAdminAdapter() for multi-DB support.
 */

import * as crypto from 'crypto';
import type { Session } from '../types/rbac.types.js';
import { getAdminAdapter } from './core.js';
import { generateToken } from './password.js';

/** Session row shape returned by the DB. */
interface SessionRow {
  session_id: string;
  user_id: string;
  token: string;
  device: string;
  ip_address: string;
  login_at: string;
  expires_at: string;
  is_active: number;
}

/** Row with joined user fields for validation. */
interface SessionUserRow extends SessionRow {
  username: string;
  access_group_id: string;
  status: string;
}

/**
 * Create a new session for a user.
 * @returns Session with plain-text token
 */
export async function createSession(
  userId: string,
  device?: string,
  ip?: string,
): Promise<Session & { token: string }> {
  const adapter = getAdminAdapter();
  const sessionId = 'sess-' + crypto.randomUUID().slice(0, 8);
  const token = generateToken();
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await adapter.runAsync(
    `INSERT INTO sessions (session_id, user_id, token, device, ip_address, login_at, expires_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [sessionId, userId, token, device || '', ip || '', now.toISOString(), expires.toISOString()],
  );

  return {
    sessionId, userId, token,
    device, ipAddress: ip,
    loginAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    isActive: true,
  };
}

/**
 * Validate an opaque session token.
 * Checks is_active, expiry, and user status.
 * @returns Session identity or null if invalid/expired
 */
export async function validateSession(
  token: string,
): Promise<{ userId: string; username: string; accessGroupId: string } | null> {
  const adapter = getAdminAdapter();
  const row = await adapter.getAsync<SessionUserRow>(
    `SELECT s.user_id, s.expires_at, s.is_active, u.username, u.access_group_id, u.status
     FROM sessions s JOIN users u ON s.user_id = u.user_id
     WHERE s.token = ?`,
    [token],
  );

  if (!row) return null;
  if (!row.is_active) return null;
  if (row.status !== 'ACTIVE') return null;
  if (new Date(row.expires_at) < new Date()) {
    // Expire the session in the background — don't block the response
    adapter.runAsync('UPDATE sessions SET is_active = 0 WHERE token = ?', [token])
      .catch(() => {});
    return null;
  }

  return { userId: row.user_id, username: row.username, accessGroupId: row.access_group_id };
}

/** Invalidate a single session by token. */
export async function invalidateSession(token: string): Promise<void> {
  const adapter = getAdminAdapter();
  await adapter.runAsync('UPDATE sessions SET is_active = 0 WHERE token = ?', [token]);
}

/**
 * Invalidate all active sessions for a user (e.g., on disable or force-logout).
 * @returns Number of sessions terminated
 */
export async function invalidateUserSessions(userId: string): Promise<number> {
  const adapter = getAdminAdapter();
  const result = await adapter.runAsync(
    'UPDATE sessions SET is_active = 0 WHERE user_id = ? AND is_active = 1',
    [userId],
  );
  return result.changes;
}

/**
 * Rotate a session token (sliding expiry).
 * @returns New token + expiry or null if session is invalid
 */
export async function refreshSession(
  token: string,
): Promise<{ token: string; expiresAt: string } | null> {
  const adapter = getAdminAdapter();
  const row = await adapter.getAsync<Pick<SessionUserRow, 'user_id' | 'expires_at' | 'is_active' | 'status'>>(
    `SELECT s.user_id, s.expires_at, s.is_active, u.status
     FROM sessions s JOIN users u ON s.user_id = u.user_id
     WHERE s.token = ?`,
    [token],
  );

  if (!row || !row.is_active || row.status !== 'ACTIVE') return null;
  if (new Date(row.expires_at) < new Date()) {
    await adapter.runAsync('UPDATE sessions SET is_active = 0 WHERE token = ?', [token]);
    return null;
  }

  const newToken = generateToken();
  const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await adapter.runAsync(
    'UPDATE sessions SET token = ?, expires_at = ? WHERE token = ?',
    [newToken, newExpires, token],
  );

  return { token: newToken, expiresAt: newExpires };
}

/**
 * List all active sessions for a user.
 * @returns Array of active Session objects
 */
export async function getUserSessions(userId: string): Promise<Session[]> {
  const adapter = getAdminAdapter();
  const rows = await adapter.allAsync<Record<string, unknown>>(
    'SELECT * FROM sessions WHERE user_id = ? AND is_active = 1 ORDER BY login_at DESC',
    [userId],
  );
  return rows.map(r => ({
    sessionId: r.session_id as string,
    userId: r.user_id as string,
    device: r.device as string,
    ipAddress: r.ip_address as string,
    loginAt: r.login_at as string,
    expiresAt: r.expires_at as string,
    isActive: !!(r.is_active as number),
  }));
}
