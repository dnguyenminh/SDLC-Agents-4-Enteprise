/**
 * admin/db/refresh-tokens.ts — Opaque refresh-token storage (hashed at rest).
 * SA4E-321: tokens are stored as SHA-256; a DB leak yields no usable credential.
 * Rotation keeps every live token of a family valid so two clients refreshing
 * concurrently do not lock each other out; reuse of a token older than the
 * grace window revokes the whole family (stolen-token detection).
 */

import * as crypto from 'crypto';
import { getDbAdapter } from './core.js';
import { generateToken } from './password.js';

/** Absolute refresh-token lifetime: 7 days from first login. */
export const REFRESH_TTL_SEC = 7 * 24 * 60 * 60;

/** How long a superseded token stays usable for concurrent refreshes. */
export const REFRESH_GRACE_SEC = 60;

/** refresh_tokens row shape. */
export interface RefreshTokenRow {
  token_hash: string;
  session_id: string;
  user_id: string;
  family_id: string;
  used_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  created_at: string;
}

/** SHA-256 of the opaque refresh token — the value stored in the DB. */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Mint a refresh token for a session and persist its hash. */
export async function issueRefreshToken(
  sessionId: string,
  userId: string,
  familyId: string,
  absoluteExpiresAt: string,
): Promise<{ token: string; expiresAt: string }> {
  const token = generateToken();
  const expiresAt = new Date(
    Math.min(new Date(absoluteExpiresAt).getTime(), Date.now() + REFRESH_TTL_SEC * 1000),
  ).toISOString();
  await getDbAdapter().runAsync(
    `INSERT INTO refresh_tokens (token_hash, session_id, user_id, family_id, used_at, revoked_at, expires_at, created_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`,
    [hashRefreshToken(token), sessionId, userId, familyId, expiresAt, new Date().toISOString()],
  );
  return { token, expiresAt };
}

/** Look up a refresh token by its plaintext value. */
export async function findRefreshToken(token: string): Promise<RefreshTokenRow | null> {
  const row = await getDbAdapter().getAsync<RefreshTokenRow>(
    'SELECT * FROM refresh_tokens WHERE token_hash = ?',
    [hashRefreshToken(token)],
  );
  return row ?? null;
}

/** Mark a token as consumed (starts its grace window). */
export async function markRefreshTokenUsed(tokenHash: string): Promise<void> {
  await getDbAdapter().runAsync(
    'UPDATE refresh_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL',
    [new Date().toISOString(), tokenHash],
  );
}

/** Revoke every token in a rotation family (reuse detected). */
export async function revokeRefreshFamily(familyId: string): Promise<void> {
  await getDbAdapter().runAsync(
    'UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL',
    [new Date().toISOString(), familyId],
  );
}

/** Revoke every refresh token of a session (logout). */
export async function revokeSessionRefreshTokens(sessionId: string): Promise<void> {
  await getDbAdapter().runAsync(
    'UPDATE refresh_tokens SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL',
    [new Date().toISOString(), sessionId],
  );
}

/** Revoke every refresh token of a user (force-logout / disable). */
export async function revokeUserRefreshTokens(userId: string): Promise<void> {
  await getDbAdapter().runAsync(
    'UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
    [new Date().toISOString(), userId],
  );
}

/** True when the presented token is still inside its post-rotation grace window. */
export function isWithinGrace(row: RefreshTokenRow): boolean {
  if (!row.used_at) return false;
  return Date.now() - new Date(row.used_at).getTime() <= REFRESH_GRACE_SEC * 1000;
}
