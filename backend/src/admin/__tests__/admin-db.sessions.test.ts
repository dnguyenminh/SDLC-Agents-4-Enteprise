/**
 * Unit Tests — admin-db.ts (KSA-285: Auth & Multitenant)
 * SA4E-50: All DB functions are now async — all calls must be awaited.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createSession,
  validateSession,
  invalidateSession,
  invalidateUserSessions,
  getUserByUsername,
  getAdminDb,
  initAdapters,
} from '../admin-db.js';

// Await shared DB init (schema + admin seed) before any test touches the DB —
// getDbAdapter() inits fire-and-forget, so getUserByUsername('admin') would
// otherwise race seeding and return null.
beforeAll(async () => {
  await initAdapters();
});

// ============================================================
// 2. Session Management
// ============================================================

describe('Session Management', () => {
  let testUserId: string;

  beforeAll(async () => {
    const user = await getUserByUsername('admin');
    testUserId = user!.userId;
  });

  it('createSession returns session with token', async () => {
    const session = await createSession(testUserId, 'TestDevice', '127.0.0.1');
    expect(session.token).toBeDefined();
    expect(session.token.length).toBe(64);
    expect(session.userId).toBe(testUserId);
    expect(session.sessionId).toMatch(/^sess-/);
    expect(session.expiresAt).toBeDefined();
    expect(session.isActive).toBe(true);
  });

  it('validateSession returns user info for valid token', async () => {
    const session = await createSession(testUserId);
    const result = await validateSession(session.token);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe(testUserId);
    expect(result!.username).toBe('admin');
    expect(result!.accessGroupId).toBe('grp-admin');
  });

  it('validateSession returns null for invalid token', async () => {
    const result = await validateSession('nonexistent-token-12345');
    expect(result).toBeNull();
  });

  it('invalidateSession makes token invalid', async () => {
    const session = await createSession(testUserId);
    expect(await validateSession(session.token)).not.toBeNull();
    await invalidateSession(session.token);
    expect(await validateSession(session.token)).toBeNull();
  });

  it('invalidateUserSessions terminates all active sessions', async () => {
    const s1 = await createSession(testUserId);
    const s2 = await createSession(testUserId);
    expect(await validateSession(s1.token)).not.toBeNull();
    expect(await validateSession(s2.token)).not.toBeNull();
    const terminated = await invalidateUserSessions(testUserId);
    expect(terminated).toBeGreaterThanOrEqual(2);
    expect(await validateSession(s1.token)).toBeNull();
    expect(await validateSession(s2.token)).toBeNull();
  });

  it('expired token returns null from validateSession', async () => {
    const db = getAdminDb();
    const token = 'expired-token-test-' + Date.now();
    const pastDate = new Date(Date.now() - 1000).toISOString();
    await db.runAsync(`INSERT INTO sessions (session_id, user_id, token, device, ip_address, login_at, expires_at, is_active)
      VALUES (?, ?, ?, '', '', ?, ?, 1)`,
      ['sess-expired-' + Date.now(), testUserId, token, pastDate, pastDate]
    );
    const result = await validateSession(token);
    expect(result).toBeNull();
  });
});
