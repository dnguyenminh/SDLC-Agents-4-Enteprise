/**
 * admin/db/session-issue.ts — Create a session and its dual-token pair.
 * SA4E-321: the session row stores only sha256(refreshToken); the plaintext
 * refresh token and the access JWT are returned to the caller exactly once.
 */

import * as crypto from 'crypto';
import type { Session } from '../types/rbac.types.js';
import { getDbAdapter } from './core.js';
import { ACCESS_TTL_SEC, signAccessJwt } from './jwt.js';
import { hashRefreshToken, issueRefreshToken } from './refresh-tokens.js';
import {
  ABSOLUTE_TTL_MS,
  SESSION_TTL_MS,
  type IssuedTokens,
} from './session-types.js';

/**
 * Create a new session for a user.
 * @returns Session carrying the plaintext refresh token plus a fresh access JWT
 */
export async function createSession(
  userId: string,
  device?: string,
  ip?: string,
  userAgentHash?: string,
): Promise<Session & IssuedTokens> {
  const adapter = getDbAdapter();
  const sessionId = 'sess-' + crypto.randomUUID().slice(0, 8);
  const now = new Date();
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_TTL_MS).toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  await adapter.runAsync(
    `INSERT INTO sessions (session_id, user_id, token, device, ip_address, user_agent_hash, login_at, expires_at, absolute_expires_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [sessionId, userId, '', device || '', ip || '', userAgentHash || '', now.toISOString(), expiresAt, absoluteExpiresAt],
  );

  const refresh = await issueRefreshToken(sessionId, userId, sessionId, absoluteExpiresAt);
  await adapter.runAsync('UPDATE sessions SET token = ? WHERE session_id = ?', [
    hashRefreshToken(refresh.token),
    sessionId,
  ]);

  return {
    sessionId,
    userId,
    token: refresh.token,
    accessToken: signAccessJwt({ sub: userId, sid: sessionId }),
    refreshToken: refresh.token,
    expiresAt,
    refreshExpiresAt: refresh.expiresAt,
    expiresIn: ACCESS_TTL_SEC,
    device,
    ipAddress: ip,
    loginAt: now.toISOString(),
    isActive: true,
  };
}
