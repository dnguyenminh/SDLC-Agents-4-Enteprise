/**
 * admin/db/session-types.ts — Shared session policy, row shapes and helpers.
 * SA4E-321: dual-token auth. Split out of sessions.ts so the issue / validate /
 * refresh+revoke modules stay small and single-purpose (200-line standard).
 */

import { getDbAdapter } from './core.js';
import { signAccessJwt } from './jwt.js';
import { sessionCacheSet } from './session-cache.js';

/** Sliding session validity — extended on every successful refresh. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Hard session cap from first login — never extended. */
export const ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Session row shape returned by the DB. */
export interface SessionRow {
  session_id: string;
  user_id: string;
  token: string;
  device: string;
  ip_address: string;
  user_agent_hash: string;
  login_at: string;
  expires_at: string;
  absolute_expires_at: string;
  is_active: number;
}

/** Row with joined user fields for validation. */
export interface SessionUserRow extends SessionRow {
  username: string;
  access_group_id: string;
  status: string;
}

/** Identity handed to callers after a credential checks out. */
export interface SessionIdentity {
  userId: string;
  username: string;
  accessGroupId: string;
}

/** Tokens returned on issue/refresh: back-compat `token` + the dual-token pair. */
export interface IssuedTokens {
  token: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
  expiresIn: number;
}

/** Columns shared by every session+user lookup. */
export const ID_COLUMNS = `s.session_id, s.user_id, s.token, s.device, s.ip_address, s.user_agent_hash,
  s.login_at, s.expires_at, s.absolute_expires_at, s.is_active, u.username, u.access_group_id, u.status`;

/** Cache key for one session's positive verdict. */
export function cacheKey(sessionId: string): string {
  return `sess:${sessionId}`;
}

/** Apply every session/user validity rule to a loaded row. */
export function evaluate(row: SessionUserRow, userAgentHash?: string): SessionIdentity | null {
  if (!row.is_active || row.status !== 'ACTIVE') return null;
  const now = Date.now();
  if (new Date(row.expires_at).getTime() < now) return null;
  if (row.absolute_expires_at && new Date(row.absolute_expires_at).getTime() < now) return null;
  if (userAgentHash && row.user_agent_hash && row.user_agent_hash !== userAgentHash) return null;
  return { userId: row.user_id, username: row.username, accessGroupId: row.access_group_id };
}

/** Load one session joined with its user; null when the session is unknown. */
export async function loadSessionUserRow(sessionId: string): Promise<SessionUserRow | null> {
  const row = await getDbAdapter().getAsync<SessionUserRow>(
    `SELECT ${ID_COLUMNS} FROM sessions s JOIN users u ON s.user_id = u.user_id WHERE s.session_id = ?`,
    [sessionId],
  );
  return row ?? null;
}

/** Load + evaluate a session and cache the positive verdict for 30s. */
export async function sessionIdentity(
  sessionId: string,
  userAgentHash?: string,
): Promise<SessionIdentity | null> {
  const row = await loadSessionUserRow(sessionId);
  const identity = row ? evaluate(row, userAgentHash) : null;
  if (identity) sessionCacheSet(cacheKey(sessionId), true, identity);
  return identity;
}

/** Mint the 15-minute access JWT for a session row. */
export function accessJwtFor(row: SessionUserRow): string {
  return signAccessJwt({ sub: row.user_id, sid: row.session_id });
}
