/**
 * Integration Tests — Auth Flow (KSA-285: Auth & Multitenant)
 * Tests auth flow via Hono in-process: login, session lifecycle, password change, force logout.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { createAdminRoute } from '../../src/server/routes/admin.js';
import { TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD } from '../test-credentials.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

let app: Hono;
let adminToken: string;

beforeAll(async () => {
  app = new Hono();
  const adminRoute = createAdminRoute(logger);
  app.route('/', adminRoute);

  // Login as admin
  const res = await app.request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
  });
  const data = (await res.json()) as any;
  adminToken = data.token;
});

function authHeaders(token?: string) {
  return {
    Authorization: `Bearer ${token || adminToken}`,
    'Content-Type': 'application/json',
  };
}

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
// 3. Force Logout Terminates All Sessions
// ============================================================

describe('Auth Flow — Force Logout', () => {
  it('force-logout terminates all sessions for a user', async () => {
    // Create test user
    const createRes = await app.request('/api/admin/users', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        username: `force-logout-${Date.now()}`,
        email: 'fl@test.com',
        password: 'TestPass123',
        accessGroupId: 'grp-admin',
      }),
    });
    const createData = (await createRes.json()) as any;
    const userId = createData.user.userId;
    const username = createData.user.username;

    // Login as test user (2 sessions)
    const login1 = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'TestPass123' }),
    });
    const loginData1 = (await login1.json()) as any;

    const login2 = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'TestPass123' }),
    });
    const loginData2 = (await login2.json()) as any;

    // Verify sessions work
    const check1 = await app.request('/api/admin/auth/me', { headers: authHeaders(loginData1.token) });
    expect(check1.status).toBe(200);

    // Admin force-logouts user
    const forceRes = await app.request(`/api/admin/users/${userId}/force-logout`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(forceRes.status).toBe(200);
    const forceData = (await forceRes.json()) as any;
    expect(forceData.terminated).toBeGreaterThanOrEqual(2);

    // Both tokens now invalid
    const after1 = await app.request('/api/admin/auth/me', { headers: authHeaders(loginData1.token) });
    const after2 = await app.request('/api/admin/auth/me', { headers: authHeaders(loginData2.token) });
    expect(after1.status).toBe(401);
    expect(after2.status).toBe(401);

    // Cleanup
    await app.request(`/api/admin/users/${userId}`, { method: 'DELETE', headers: authHeaders() });
  });
});

// ============================================================
// 4. Disabled User Cannot Login
// ============================================================

describe('Auth Flow — Disabled User', () => {
  it('disabled user cannot login', async () => {
    const username = `disabled-user-${Date.now()}`;

    // Create user
    const createRes = await app.request('/api/admin/users', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        username,
        email: 'disabled@test.com',
        password: 'TestPass123',
        accessGroupId: 'grp-admin',
      }),
    });
    const createData = (await createRes.json()) as any;
    const userId = createData.user.userId;

    // Disable user
    await app.request(`/api/admin/users/${userId}/status`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'DISABLED' }),
    });

    // Try to login as disabled user
    const loginRes = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'TestPass123' }),
    });
    expect(loginRes.status).toBe(403);

    // Cleanup
    await app.request(`/api/admin/users/${userId}`, { method: 'DELETE', headers: authHeaders() });
  });
});

// ============================================================
// 5. Password Change Flow
// ============================================================

describe('Auth Flow — Password Change', () => {
  it('user can change own password', async () => {
    const username = `pwchange-user-${Date.now()}`;

    // Create user
    const createRes = await app.request('/api/admin/users', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        username,
        email: 'pwchange@test.com',
        password: 'OldPass123',
        accessGroupId: 'grp-admin',
      }),
    });
    const createData = (await createRes.json()) as any;
    const userId = createData.user.userId;

    // Login as new user
    const loginRes = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'OldPass123' }),
    });
    const loginData = (await loginRes.json()) as any;
    const userToken = loginData.token;

    // Change password
    const changeRes = await app.request('/api/admin/auth/change-password', {
      method: 'POST',
      headers: authHeaders(userToken),
      body: JSON.stringify({ currentPassword: 'OldPass123', newPassword: 'NewPass456' }),
    });
    expect(changeRes.status).toBe(200);

    // Old password no longer works
    const oldLoginRes = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'OldPass123' }),
    });
    expect(oldLoginRes.status).toBe(401);

    // New password works
    const newLoginRes = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'NewPass456' }),
    });
    expect(newLoginRes.status).toBe(200);

    // Cleanup
    await app.request(`/api/admin/users/${userId}`, { method: 'DELETE', headers: authHeaders() });
  });

  it('change password with wrong current password fails', async () => {
    const changeRes = await app.request('/api/admin/auth/change-password', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ currentPassword: 'wrongCurrent', newPassword: 'NewPass456' }),
    });
    expect(changeRes.status).toBe(401);
  });

  it('change password with too-short new password fails', async () => {
    const changeRes = await app.request('/api/admin/auth/change-password', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ currentPassword: TEST_ADMIN_PASSWORD, newPassword: '12345' }),
    });
    expect(changeRes.status).toBe(400);
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

    // Manually expire the session in DB
    const { getAdminDb } = await import('../../src/admin/admin-db.js');
    const db = getAdminDb();
    const pastDate = new Date(Date.now() - 1000).toISOString();
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(pastDate, token);

    // Token should now be rejected
    const expiredRes = await app.request('/api/admin/auth/me', { headers: authHeaders(token) });
    expect(expiredRes.status).toBe(401);
  });
});
