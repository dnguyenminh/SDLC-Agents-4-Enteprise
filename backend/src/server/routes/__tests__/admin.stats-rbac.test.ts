/**
 * Admin route tests — stats + RBAC endpoints.
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

describe('Admin Routes — /api/admin/stats', () => {
  it('GET without auth returns 401', async () => {
    const res = await app.request('/api/admin/stats');
    expect(res.status).toBe(401);
  });

  it('GET with auth returns stats', async () => {
    const res = await app.request('/api/admin/stats', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('kbEntries');
    expect(body).toHaveProperty('users');
    expect(body).toHaveProperty('mcpServers');
    expect(body.users).toBeGreaterThanOrEqual(1);
  });
});

describe('Admin Routes — /api/admin/rbac', () => {
  let testGroupId: string;
  const uniqueGroupName = `Viewers-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  it('GET /api/admin/rbac/groups returns groups with permissions', async () => {
    const res = await app.request('/api/admin/rbac/groups', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.groups.length).toBeGreaterThanOrEqual(1);
    const adminGroup = body.groups.find((g: any) => g.name === 'Administrators');
    expect(adminGroup).toBeDefined();
    expect(adminGroup.isSystem).toBe(true);
    expect(adminGroup.permissions.length).toBeGreaterThan(0);
  });

  it('POST /api/admin/rbac/groups creates new group', async () => {
    const res = await app.request('/api/admin/rbac/groups', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: uniqueGroupName, permissions: [{ name: 'KB_READ', roleData: {} }] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    testGroupId = body.group.accessGroupId || body.group.id;
  });

  it('PUT /api/admin/rbac/groups/:id updates group', async () => {
    const res = await app.request(`/api/admin/rbac/groups/${testGroupId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ name: `${uniqueGroupName}-updated`, permissions: [{ name: 'KB_READ', roleData: {} }, { name: 'DASHBOARD_VIEW', roleData: {} }] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });

  it('DELETE /api/admin/rbac/groups/:id deletes non-system group', async () => {
    const res = await app.request(`/api/admin/rbac/groups/${testGroupId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
  });

  it('DELETE system group returns 400', async () => {
    const res = await app.request('/api/admin/rbac/groups/grp-admin', {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/admin/rbac/permissions returns all permission IDs', async () => {
    const res = await app.request('/api/admin/rbac/permissions', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.permissions).toContain('DASHBOARD_VIEW');
    expect(body.permissions).toContain('KB_READ');
    expect(body.permissions.length).toBe(14);
  });
});
