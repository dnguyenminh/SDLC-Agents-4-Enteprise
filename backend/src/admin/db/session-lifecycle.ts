/**
 * admin/db/session-lifecycle.ts — Logout, force-logout and refresh rotation.
 * SA4E-321: a session is deactivated AND its refresh-token family revoked, and
 * the 30s revocation cache is busted so an access JWT dies with it.
 */

import { getDbAdapter } from './core.js';
import { ACCESS_TTL_SEC, looksLikeJwt, verifyAccessJwt } from './jwt.js';
import {
  findRefreshToken,
  hashRefreshToken,
  isWithinGrace,
  issueRefreshToken,
  markRefreshTokenUsed,
  revokeRefreshFamily,
  revokeSessionRefreshTokens,
  revokeUserRefreshTokens,
} from './refresh-tokens.js';
import { sessionCacheClear, sessionCacheInvalidate } from './session-cache.js';
import {
  ABSOLUTE_TTL_MS,
  SESSION_TTL_MS,
  accessJwtFor,
  cacheKey,
  evaluate,
  loadSessionUserRow,
  type IssuedTokens,
  type SessionUserRow,
} from './session-types.js';

/** Invalidate a single session by access JWT or refresh token. */
export async function invalidateSession(token: string): Promise<void> {
  const adapter = getDbAdapter();
  let sessionId: string | null = null;
  if (looksLikeJwt(token)) {
    const result = verifyAccessJwt(token);
    sessionId = result.ok ? result.claims.sid : null;
  } else {
    const row = await adapter.getAsync<{ session_id: string }>(
      'SELECT session_id FROM refresh_tokens WHERE token_hash = ?',
      [hashRefreshToken(token)],
    );
    sessionId = row?.session_id ?? null;
  }
  if (!sessionId) return;
  await adapter.runAsync('UPDATE sessions SET is_active = 0 WHERE session_id = ?', [sessionId]);
  await revokeSessionRefreshTokens(sessionId);
  sessionCacheInvalidate(cacheKey(sessionId));
}

/**
 * Invalidate all active sessions for a user (e.g., on disable or force-logout).
 * @returns Number of sessions terminated
 */
export async function invalidateUserSessions(userId: string): Promise<number> {
  const result = await getDbAdapter().runAsync(
    'UPDATE sessions SET is_active = 0 WHERE user_id = ? AND is_active = 1',
    [userId],
  );
  await revokeUserRefreshTokens(userId);
  sessionCacheClear();
  return result.changes;
}

/**
 * Rotate a refresh token: revoke-if-reused, mint a fresh token, renew the
 * sliding expiry (never past the 7-day absolute cap), issue a new access JWT.
 * @returns Token pair + expiries or null if the credential is not valid
 */
export async function refreshSession(
  token: string,
  currentUserAgentHash?: string,
): Promise<IssuedTokens | null> {
  if (looksLikeJwt(token)) return null;
  const adapter = getDbAdapter();
  const row = await findRefreshToken(token);
  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  if (row.used_at && !isWithinGrace(row)) {
    await revokeRefreshFamily(row.family_id);
    await adapter.runAsync('UPDATE sessions SET is_active = 0 WHERE session_id = ?', [row.session_id]);
    sessionCacheInvalidate(cacheKey(row.session_id));
    return null;
  }

  const session = await loadSessionUserRow(row.session_id);
  const identity = session ? evaluate(session, currentUserAgentHash) : null;
  if (!session || !identity) return null;

  const absoluteMs = session.absolute_expires_at
    ? new Date(session.absolute_expires_at).getTime()
    : Date.now() + ABSOLUTE_TTL_MS;
  const slidingExpiresAt = new Date(Math.min(Date.now() + SESSION_TTL_MS, absoluteMs)).toISOString();

  const next = await issueRefreshToken(
    session.session_id,
    session.user_id,
    row.family_id,
    new Date(absoluteMs).toISOString(),
  );
  await markRefreshTokenUsed(row.token_hash);
  await adapter.runAsync('UPDATE sessions SET token = ?, expires_at = ? WHERE session_id = ?', [
    hashRefreshToken(next.token),
    slidingExpiresAt,
    session.session_id,
  ]);

  return {
    token: next.token,
    accessToken: accessJwtFor(session),
    refreshToken: next.token,
    expiresAt: slidingExpiresAt,
    refreshExpiresAt: next.expiresAt,
    expiresIn: ACCESS_TTL_SEC,
  };
}
