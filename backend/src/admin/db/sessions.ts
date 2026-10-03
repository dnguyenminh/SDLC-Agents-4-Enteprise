/**
 * admin/db/sessions.ts — Session management via DatabaseAdapter async methods.
 * SA4E-50: All functions are async; use getDbAdapter() for multi-DB support.
 * SA4E-321: dual-token auth — each session carries a hashed refresh token and
 * a 15-minute access JWT. validateSession() accepts either credential.
 *
 * Issue / refresh / revoke live in sibling modules (session-issue.ts,
 * session-lifecycle.ts) with the shared policy in session-types.ts; this file
 * keeps the public `./sessions.js` API unchanged for existing importers.
 */

import type { Session } from '../types/rbac.types.js';
import { getDbAdapter } from './core.js';
import { looksLikeJwt, verifyAccessJwt } from './jwt.js';
import { hashRefreshToken } from './refresh-tokens.js';
import { sessionCacheGet, sessionCacheSet } from './session-cache.js';
import {
  ID_COLUMNS,
  cacheKey,
  evaluate,
  sessionIdentity,
  type SessionIdentity,
  type SessionUserRow,
} from './session-types.js';

export { createSession } from './session-issue.js';
export { invalidateSession, invalidateUserSessions, refreshSession } from './session-lifecycle.js';
export type { IssuedTokens, SessionIdentity } from './session-types.js';

/**
 * Validate an access JWT or an opaque refresh token.
 * Checks is_active, both expiries, and user status; a positive verdict is
 * cached for 30s so logout takes effect within that bound.
 * @returns Session identity or null if invalid/expired
 */
export async function validateSession(
  token: string,
  currentUserAgentHash?: string,
): Promise<SessionIdentity | null> {
  if (looksLikeJwt(token)) {
    const result = verifyAccessJwt(token);
    if (!result.ok) return null;
    const key = cacheKey(result.claims.sid);
    const cached = sessionCacheGet(key);
    if (cached?.valid && cached.value) return cached.value as SessionIdentity;
    return sessionIdentity(result.claims.sid, currentUserAgentHash);
  }

  const row = await getDbAdapter().getAsync<SessionUserRow>(
    `SELECT ${ID_COLUMNS} FROM refresh_tokens rt
     JOIN sessions s ON rt.session_id = s.session_id
     JOIN users u ON s.user_id = u.user_id
     WHERE rt.token_hash = ?`,
    [hashRefreshToken(token)],
  );
  if (!row) return null;
  const identity = evaluate(row, currentUserAgentHash);
  if (identity) sessionCacheSet(cacheKey(row.session_id), true, identity);
  return identity;
}

/**
 * List all active sessions for a user.
 * @returns Array of active Session objects
 */
export async function getUserSessions(userId: string): Promise<Session[]> {
  const rows = await getDbAdapter().allAsync<Record<string, unknown>>(
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
