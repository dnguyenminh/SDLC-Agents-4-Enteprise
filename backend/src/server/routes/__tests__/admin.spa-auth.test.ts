/**
 * Admin route tests — SPA serving + auth endpoints.
 * Split from admin.test.ts to keep each file under the CI line-count gate
 * (<=200 lines). No logic changed — tests only relocated.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { setupAdmin, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD } from './admin.helpers.js';

let app: Hono;
let authHeaders: () => Record<string, string>;

beforeAll(async () => {
  const ctx = await setupAdmin();
  app = ctx.app;
  authHeaders = ctx.authHeaders;
});

describe('Admin Routes — /admin (SPA)', () => {
  it('GET /admin returns HTML or 404 when SPA file missing', async () => {
    const res = await app.request('/admin');
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers.get('content-type')).toContain('text/html');
    }
  });

  it('GET /admin/dashboard returns SPA HTML (client-side routing)', async () => {
    const res = await app.request('/admin/dashboard');
    expect([200, 404]).toContain(res.status);
  });
});

describe('Admin Routes — /api/admin/auth', () => {
  it('POST /api/admin/auth/login with valid credentials returns token', async () => {
    const res = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('token');
    expect(body).toHaveProperty('user');
    expect(body.user.username).toBe('admin');
    expect(body).toHaveProperty('expiresAt');
  });

  it('POST /api/admin/auth/login with invalid password returns 401', async () => {
    const res = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.error).toBe('Invalid credentials');
  });

  it('POST /api/admin/auth/login with unknown user returns 401', async () => {
    const res = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nobody', password: 'test' }),
    });
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/auth/me returns current user info', async () => {
    const res = await app.request('/api/admin/auth/me', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.username).toBe('admin');
    expect(body.permissions).toContain('DASHBOARD_VIEW');
  });

  it('POST /api/admin/auth/logout invalidates session', async () => {
    // Login to get a new token
    const loginRes = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
    });
    const loginData = await loginRes.json() as any;
    const tempToken = loginData.token;

    // Logout
    const res = await app.request('/api/admin/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tempToken}` },
    });
    expect(res.status).toBe(200);

    // Token should now be invalid
    const meRes = await app.request('/api/admin/auth/me', {
      headers: { Authorization: `Bearer ${tempToken}` },
    });
    expect(meRes.status).toBe(401);
  });

  // SA4E-319: session sharing across clients with different user-agents.
  describe('X-Client-Type: extension session (no UA-binding)', () => {
    it('extension-issued session is accepted from a DIFFERENT user-agent (webview iframe)', async () => {
      // Login as the extension host (Node UA) with the extension marker.
      const loginRes = await app.request('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-Type': 'extension', 'User-Agent': 'node-extension-host/1.0' },
        body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
      });
      expect(loginRes.status).toBe(200);
      const token = (await loginRes.json() as any).token;

      // Use that token from a DIFFERENT UA (simulating the Chromium webview iframe).
      const profileRes = await app.request('/api/admin/profile', {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Mozilla/5.0 (webview-chromium)' },
      });
      expect(profileRes.status).toBe(200);
    });

    it('browser-issued session (no marker) is REJECTED from a different user-agent (UA-binding stays ON)', async () => {
      // Login WITHOUT the extension marker (public browser flow) → session binds to this UA.
      const loginRes = await app.request('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (browser-A)' },
        body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
      });
      expect(loginRes.status).toBe(200);
      const token = (await loginRes.json() as any).token;

      // A different UA must be rejected (session-fixation hardening preserved).
      const profileRes = await app.request('/api/admin/profile', {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Mozilla/5.0 (browser-B-stolen-token)' },
      });
      expect(profileRes.status).toBe(401);
    });
  });
});
