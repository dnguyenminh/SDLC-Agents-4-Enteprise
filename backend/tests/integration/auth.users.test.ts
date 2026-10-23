/**
 * Integration Tests — Auth Flow (KSA-285: Auth & Multitenant)
 * Force logout, disabled users and password change via Hono in-process.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createAuthHarness, TEST_ADMIN_PASSWORD, type AuthHarness } from './helpers.js';

let app: AuthHarness['app'];
let authHeaders: AuthHarness['authHeaders'];

beforeAll(async () => {
  const harness = await createAuthHarness();
  app = harness.app;
  authHeaders = harness.authHeaders;
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
    expect(loginRes.status).toBe(401);

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
