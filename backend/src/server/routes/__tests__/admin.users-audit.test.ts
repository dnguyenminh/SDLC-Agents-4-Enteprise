/**
 * Admin route tests — users CRUD + audit endpoints.
 * Split from admin.test.ts to keep each file under the CI line-count gate
 * (<=200 lines). No logic changed — tests only relocated.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { setupAdmin } from './admin.helpers.js';

let app: Hono;
let authHeaders: () => Record<string, string>;

beforeAll(async () => {
  const ctx = await setupAdmin();
  app = ctx.app;
  authHeaders = ctx.authHeaders;
});

describe('Admin Routes — /api/admin/users (CRUD)', () => {
  let testUserId: string;

  it('GET /api/admin/users returns user list with pagination', async () => {
    const res = await app.request('/api/admin/users', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('users');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('page');
    expect(body.users.some((u: any) => u.username === 'admin')).toBe(true);
  });

  it('POST /api/admin/users creates new user', async () => {
    const res = await app.request('/api/admin/users', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ username: 'testuser', email: 'test@test.com', password: 'test123', accessGroupId: 'grp-admin' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.user.username).toBe('testuser');
    expect(body.user.forcePasswordChange).toBe(true);
    testUserId = body.user.userId;
  });

  it('POST /api/admin/users rejects duplicate username', async () => {
    const res = await app.request('/api/admin/users', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ username: 'testuser', email: 'x@x.com', password: 'test123', accessGroupId: 'grp-admin' }),
    });
    expect(res.status).toBe(409);
  });

  it('PUT /api/admin/users/:id/status disables user', async () => {
    const res = await app.request(`/api/admin/users/${testUserId}/status`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'DISABLED' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });

  it('POST /api/admin/users/:id/reset-password returns temp password', async () => {
    const res = await app.request(`/api/admin/users/${testUserId}/reset-password`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.temporaryPassword).toBeDefined();
    expect(body.temporaryPassword.length).toBeGreaterThan(0);
  });

  it('DELETE /api/admin/users/:id deletes user', async () => {
    const res = await app.request(`/api/admin/users/${testUserId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
  });

  it('DELETE system admin returns 400', async () => {
    const res = await app.request('/api/admin/users/user-admin-001', {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
  });
});

describe('Admin Routes — /api/admin/audit', () => {
  it('GET /api/admin/audit returns audit entries from real operations', async () => {
    const res = await app.request('/api/admin/audit', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('entries');
    expect(body).toHaveProperty('total');
    // Should have entries from login/user operations above
    expect(body.total).toBeGreaterThan(0);
  });
});
