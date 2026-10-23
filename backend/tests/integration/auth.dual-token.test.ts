/**
 * Integration Tests — Auth Flow (KSA-285: Auth & Multitenant)
 * Dual-token login response + refresh rotation (SA4E-321) via Hono in-process.
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
// 1b. Dual-token login response + refresh rotation (SA4E-321)
// ============================================================

describe('Auth Flow — Dual Token', () => {
  async function login() {
    const res = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as any;
  }

  it('login returns an access JWT plus a rotating refresh token', async () => {
    const data = await login();
    expect(data.token).toBe(data.refreshToken);
    expect(data.token).toHaveLength(64);
    expect(data.accessToken.split('.')).toHaveLength(3);
    expect(data.expiresIn).toBe(900);
    expect(data.expiresAt).toBeDefined();
    expect(Date.parse(data.refreshExpiresAt)).toBeGreaterThan(Date.parse(data.expiresAt));
  });

  it('authenticates with the access JWT alone', async () => {
    const data = await login();
    const meRes = await app.request('/api/admin/auth/me', { headers: authHeaders(data.accessToken) });
    expect(meRes.status).toBe(200);
    const me = (await meRes.json()) as any;
    expect(me.username).toBe(TEST_ADMIN_USERNAME);
  });

  it('refresh rotates the pair and keeps the session', async () => {
    const data = await login();
    const refreshRes = await app.request('/api/admin/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: data.refreshToken }),
    });
    expect(refreshRes.status).toBe(200);
    const rotated = (await refreshRes.json()) as any;
    expect(rotated.refreshToken).not.toBe(data.refreshToken);
    expect(rotated.accessToken).toBeDefined();

    const meRes = await app.request('/api/admin/auth/me', { headers: authHeaders(rotated.accessToken) });
    expect(meRes.status).toBe(200);
  });

  it('rejects a forged access JWT', async () => {
    const data = await login();
    const parts = data.accessToken.split('.');
    const forged = `${parts[0]}.${parts[1]}.forgedsignature`;
    const meRes = await app.request('/api/admin/auth/me', { headers: authHeaders(forged) });
    expect(meRes.status).toBe(401);
  });
});
