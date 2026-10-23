/**
 * E2E API Tests — Admin Portal: Auth login flow.
 * (Split from admin-api.e2e.test.ts — BR-18 ≤200 lines/file.)
 * Tests real HTTP requests against the E2E test server (dynamic port).
 * Server is started by global-setup with an isolated temp database.
 *
 * Run: npm run test:e2e-api
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  API,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  apiCall,
  ensureServerUp,
  logout,
  setAuthToken,
} from './admin-api.fixtures.js';

beforeAll(async () => {
  await ensureServerUp();
});

// ============================================================
// 1. Login Flow
// ============================================================

describe('Auth — Login Flow', () => {
  it('should login with valid credentials and get token', async () => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.token).toBeDefined();
    expect(data.token.length).toBeGreaterThan(10);
    expect(data.user).toBeDefined();
    expect(data.user.username).toBe(ADMIN_USERNAME);
    expect(data.user.permissions).toBeInstanceOf(Array);
    expect(data.expiresAt).toBeDefined();

    // Store token for subsequent tests
    setAuthToken(data.token);
  });

  it('should reject invalid credentials with 401', async () => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' }),
    });
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it('should reject missing credentials with 400', async () => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '', password: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('should get current user info via /auth/me', async () => {
    const { status, data } = await apiCall('/auth/me');
    expect(status).toBe(200);
    expect(data.username).toBe(ADMIN_USERNAME);
    expect(data.permissions).toBeInstanceOf(Array);
  });
});

afterAll(async () => {
  await logout();
});
