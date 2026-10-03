/**
 * Integration tests — dual-token session lifecycle (SA4E-321).
 * A session now carries a 15-minute access JWT plus a rotating opaque refresh
 * token: both identify the session, only the refresh token can be rotated, and
 * replaying a rotated token past the grace window kills the whole family.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createSession,
  validateSession,
  invalidateSession,
  refreshSession,
  getUserByUsername,
  initAdapters,
  getAdminDb,
} from '../../admin-db.js';
import { verifyAccessJwt } from '../jwt.js';
import { hashRefreshToken, REFRESH_GRACE_SEC } from '../refresh-tokens.js';

let userId: string;

beforeAll(async () => {
  await initAdapters();
  const user = await getUserByUsername('admin');
  userId = user!.userId;
});

describe('issue', () => {
  it('returns an access JWT and an opaque refresh token', async () => {
    const session = await createSession(userId, 'TestDevice', '127.0.0.1');

    expect(session.accessToken.split('.')).toHaveLength(3);
    expect(session.refreshToken).toHaveLength(64);
    expect(session.token).toBe(session.refreshToken);

    const verified = verifyAccessJwt(session.accessToken);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.claims.sub).toBe(userId);
    expect(verified.claims.sid).toBe(session.sessionId);
    expect(verified.claims.exp! - verified.claims.iat!).toBe(session.expiresIn);
  });

  it('stores only a hash of the refresh token', async () => {
    const db = getAdminDb();
    const session = await createSession(userId);
    const row = await db.getAsync<{ token: string }>(
      'SELECT token FROM sessions WHERE session_id = ?',
      [session.sessionId],
    );
    expect(row!.token).toBe(hashRefreshToken(session.refreshToken));
    expect(row!.token).not.toBe(session.refreshToken);
  });
});

describe('validateSession', () => {
  it('accepts the access JWT', async () => {
    const session = await createSession(userId);
    const identity = await validateSession(session.accessToken);
    expect(identity).not.toBeNull();
    expect(identity!.userId).toBe(userId);
    expect(identity!.username).toBe('admin');
  });

  it('accepts the refresh token', async () => {
    const session = await createSession(userId);
    const identity = await validateSession(session.refreshToken);
    expect(identity).not.toBeNull();
    expect(identity!.userId).toBe(userId);
  });

  it('rejects a forged access JWT', async () => {
    const session = await createSession(userId);
    const forged = `${session.accessToken.split('.')[0]}.${session.accessToken.split('.')[1]}.deadbeef`;
    expect(await validateSession(forged)).toBeNull();
    expect(await validateSession('nope')).toBeNull();
  });

  it('logout with the access JWT also kills the refresh credential', async () => {
    const session = await createSession(userId);
    expect(await validateSession(session.refreshToken)).not.toBeNull();
    await invalidateSession(session.accessToken);
    expect(await validateSession(session.refreshToken)).toBeNull();
    expect(await validateSession(session.accessToken)).toBeNull();
  });
});

describe('refreshSession', () => {
  it('rotates the refresh token and issues a fresh access JWT', async () => {
    const first = await createSession(userId);
    const rotated = await refreshSession(first.refreshToken);
    expect(rotated).not.toBeNull();
    expect(rotated!.refreshToken).not.toBe(first.refreshToken);

    const verified = verifyAccessJwt(rotated!.accessToken);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.claims.sid).toBe(first.sessionId);

    expect(await validateSession(rotated!.refreshToken)).not.toBeNull();
    expect(await validateSession(rotated!.accessToken)).not.toBeNull();
  });

  it('keeps the superseded token valid inside the grace window', async () => {
    const first = await createSession(userId);
    const rotated = await refreshSession(first.refreshToken);
    expect(rotated).not.toBeNull();

    // Second client holding the same credential refreshes moments later.
    const concurrent = await refreshSession(first.refreshToken);
    expect(concurrent).not.toBeNull();
    expect(concurrent!.refreshToken).not.toBe(first.refreshToken);
    expect(REFRESH_GRACE_SEC).toBe(60);
  });

  it('revokes the whole family when a rotated token is replayed after the grace window', async () => {
    const db = getAdminDb();
    const first = await createSession(userId);
    const rotated = await refreshSession(first.refreshToken);
    expect(rotated).not.toBeNull();

    // Simulate a stolen token replayed long after the legitimate refresh.
    const stale = new Date(Date.now() - (REFRESH_GRACE_SEC + 30) * 1000).toISOString();
    await db.runAsync('UPDATE refresh_tokens SET used_at = ? WHERE token_hash = ?', [
      stale,
      hashRefreshToken(first.refreshToken),
    ]);

    expect(await refreshSession(first.refreshToken)).toBeNull();
    expect(await validateSession(rotated!.refreshToken)).toBeNull();
    expect(await validateSession(rotated!.accessToken)).toBeNull();
    expect(await refreshSession(rotated!.refreshToken)).toBeNull();
  });

  it('refuses an access JWT as a refresh credential', async () => {
    const session = await createSession(userId);
    expect(await refreshSession(session.accessToken)).toBeNull();
  });

  it('refuses an unknown refresh token', async () => {
    expect(await refreshSession('f'.repeat(64))).toBeNull();
  });
});
