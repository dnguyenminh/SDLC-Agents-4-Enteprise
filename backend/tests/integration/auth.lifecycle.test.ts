/**
 * Integration Tests — Auth Flow (KSA-285: Auth & Multitenant)
 * Login lifecycle, multiple sessions and session expiry via Hono in-process.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createAuthHarness, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, type AuthHarness } from './helpers.js';

let app: AuthHarness['app'];
let authHeaders: AuthHarness['authHeaders'];

beforeAll(async () => {
  const harness = await createAuthHarness();
  app = harness.app;
  authHeaders = harness.authHeaders;
});

// ============================================================
// 1. Login → Token → Access → Logout → Token Invalid
// ============================================================

describe('Auth Flow — Login / Logout Lifecycle', () => {
  it('login returns token that can access protected endpoints', async () => {
    const loginRes = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
    });
    expect(loginRes.status).toBe(200);
    const loginData = (await loginRes.json()) as any;
    const token = loginData.token;
    expect(token).toBeDefined();

    // Access protected endpoint
    const meRes = await app.request('/api/admin/auth/me', {
      headers: authHeaders(token),
    });
    expect(meRes.status).toBe(200);
    const meData = (await meRes.json()) as any;
    expect(meData.username).toBe(TEST_ADMIN_USERNAME);

    // Logout
    const logoutRes = await app.request('/api/admin/auth/logout', {
      method: 'POST',
      headers: authHeaders(token),
    });
    expect(logoutRes.status).toBe(200);

    // Token now invalid
    const afterLogout = await app.request('/api/admin/auth/me', {
      headers: authHeaders(token),
    });
    expect(afterLogout.status).toBe(401);
  });

  it('invalid credentials return 401', async () => {
    const res = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: 'wrongpass' }),
    });
    expect(res.status).toBe(401);
  });

  it('empty credentials return 400', async () => {
    const res = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '', password: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('no token returns 401 on protected endpoints', async () => {
    const res = await app.request('/api/admin/users', {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });
});

// ============================================================
// 2. Multiple Sessions Per User
// ============================================================

describe('Auth Flow — Multiple Sessions', () => {
  it('same user can have multiple active sessions', async () => {
    const login1 = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
    });
    const data1 = (await login1.json()) as any;

    const login2 = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
    });
    const data2 = (await login2.json()) as any;

    // Both tokens valid
    const me1 = await app.request('/api/admin/auth/me', { headers: authHeaders(data1.token) });
    const me2 = await app.request('/api/admin/auth/me', { headers: authHeaders(data2.token) });
    expect(me1.status).toBe(200);
    expect(me2.status).toBe(200);

    // Tokens are different
    expect(data1.token).not.toBe(data2.token);
  });
});

// ============================================================
// 6. Session Expiry
// ============================================================

describe('Auth Flow — Session Expiry', () => {
  it('expired session token is rejected', async () => {
    // Login to get a valid session
    const loginRes = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
    });
    const loginData = (await loginRes.json()) as any;
    const token = loginData.token;

    // Verify token works
    const meRes = await app.request('/api/admin/auth/me', { headers: authHeaders(token) });
    expect(meRes.status).toBe(200);

    // Manually expire the session in DB. SA4E-321: sessions.token now stores a
    // hash of the refresh token, so match on that, and drop the 30s revocation
    // cache so the expiry is visible on the very next request.
    const { getAdminDb } = await import('../../src/admin/admin-db.js');
    const { hashRefreshToken } = await import('../../src/admin/db/refresh-tokens.js');
    const { sessionCacheClear } = await import('../../src/admin/db/session-cache.js');
    const db = getAdminDb();
    const pastDate = new Date(Date.now() - 1000).toISOString();
    await db.runAsync('UPDATE sessions SET expires_at = ? WHERE token = ?', [
      pastDate,
      hashRefreshToken(token),
    ]);
    sessionCacheClear();

    // Token should now be rejected
    const expiredRes = await app.request('/api/admin/auth/me', { headers: authHeaders(token) });
    expect(expiredRes.status).toBe(401);
  });
});
