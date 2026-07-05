/**
 * Integration tests for Admin Portal routes (Hono)
 * Tests: /admin SPA serving + /api/admin/* API endpoints
 * 
 * Uses real SQLite DB (admin.db) and real auth flow.
 * Default user: admin/admin (seeded on init).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { createAdminRoute } from '../admin.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

let app: Hono;
let authToken: string;

beforeAll(async () => {
  app = new Hono();
  const adminRoute = createAdminRoute(logger);
  app.route('/', adminRoute);

  // Login to get real token
  const res = await app.request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  });
  const data = await res.json() as any;
  authToken = data.token;
});

function authHeaders() {
  return { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' };
}

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
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
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
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
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

describe('Admin Routes — /api/admin/config', () => {
  it('GET /api/admin/config returns configuration', async () => {
    const res = await app.request('/api/admin/config', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.config.server.port).toBe(48721);
    expect(body.config.embedding.model).toBe('paraphrase-multilingual-MiniLM-L12-v2');
    expect(body).toHaveProperty('history');
    expect(body).toHaveProperty('restartRequired');
  });

  it('PATCH /api/admin/config/:section/:key updates value', async () => {
    const res = await app.request('/api/admin/config/server/logLevel', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ value: 'debug' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.requiresRestart).toBe(false);
    expect(body.value).toBe('debug');
  });

  it('PATCH /api/admin/config with restart-required key returns requiresRestart=true', async () => {
    const res = await app.request('/api/admin/config/server/port', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ value: 9999 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.requiresRestart).toBe(true);
  });

  it('PATCH /api/admin/config with invalid section returns 404', async () => {
    const res = await app.request('/api/admin/config/nonexistent/key', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ value: 'test' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('Admin Routes — /api/admin/mcp/servers', () => {
  it('GET /api/admin/mcp/servers returns server list', async () => {
    const res = await app.request('/api/admin/mcp/servers', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('servers');
    expect(Array.isArray(body.servers)).toBe(true);
  });

  it('POST /api/admin/mcp/servers/:id/restart returns success', async () => {
    const res = await app.request('/api/admin/mcp/servers/test-server/restart', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });
});

// ===== STORY 2: KB Import Conflict Resolution =====
describe('Admin Routes — KB Import Conflict Resolution (STORY 2)', () => {
  it('POST /api/admin/kb/import with conflictMode=skip returns conflict info', async () => {
    const res = await app.request('/api/admin/kb/import', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        entries: [
          { id: 'new-entry-1', source: 'test', content: 'New content' },
          { id: 'new-entry-2', source: 'test2', content: 'More content' },
        ],
        conflictMode: 'skip',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('imported');
    expect(body).toHaveProperty('skipped');
    expect(body).toHaveProperty('overwritten');
    expect(body).toHaveProperty('merged');
    expect(body).toHaveProperty('conflicts');
    expect(body).toHaveProperty('message');
  });

  it('POST /api/admin/kb/import with conflictMode=overwrite accepted', async () => {
    const res = await app.request('/api/admin/kb/import', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        entries: [{ id: 'entry-x', source: 'x', content: 'x' }],
        conflictMode: 'overwrite',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });

  it('POST /api/admin/kb/import with conflictMode=merge accepted', async () => {
    const res = await app.request('/api/admin/kb/import', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        entries: [{ id: 'entry-y', source: 'y', content: 'y' }],
        conflictMode: 'merge',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });

  it('POST /api/admin/kb/import with invalid conflictMode returns 400', async () => {
    const res = await app.request('/api/admin/kb/import', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        entries: [{ id: 'e1', content: 'test' }],
        conflictMode: 'invalid',
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('conflictMode');
  });
});

// ===== STORY 3: KB Graph Node Click → Detail Panel =====
describe('Admin Routes — KB Entry Detail (STORY 3)', () => {
  it('GET /api/admin/kb/entries/:id returns entry details or 404', async () => {
    // First get any entry from the list
    const listRes = await app.request('/api/admin/kb/entries?pageSize=1', { headers: authHeaders() });
    const listBody = await listRes.json() as any;

    if (listBody.entries && listBody.entries.length > 0) {
      const entryId = listBody.entries[0].id || listBody.entries[0].entry_id;
      const res = await app.request(`/api/admin/kb/entries/${entryId}`, { headers: authHeaders() });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('title');
      expect(body).toHaveProperty('content');
      expect(body).toHaveProperty('tier');
      expect(body).toHaveProperty('tags');
      expect(body).toHaveProperty('links');
    } else {
      // No entries in DB — 404 is expected
      const res = await app.request('/api/admin/kb/entries/nonexistent-id', { headers: authHeaders() });
      expect(res.status).toBe(404);
    }
  });

  it('GET /api/admin/kb/entries/:id returns 404 for nonexistent entry', async () => {
    const res = await app.request('/api/admin/kb/entries/definitely-not-real-id-xyz', { headers: authHeaders() });
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe('Entry not found');
  });
});

// ===== STORY 4: Analytics Real Query Tracking =====
describe('Admin Routes — Analytics Real Query Tracking (STORY 4)', () => {
  it('POST /api/admin/search records query and returns results', async () => {
    const res = await app.request('/api/admin/search', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query: 'test query for tracking', debug: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('results');
    expect(body).toHaveProperty('debug');
    expect(body.debug.searchTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/admin/analytics shows real query data after search', async () => {
    // Make a few searches first
    await app.request('/api/admin/search', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query: 'analytics test 1' }),
    });
    await app.request('/api/admin/search', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query: 'analytics test 2' }),
    });

    const res = await app.request('/api/admin/analytics', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.summary).toHaveProperty('totalQueries');
    expect(body.summary.totalQueries).toBeGreaterThanOrEqual(2);
    expect(body.summary).toHaveProperty('avgQueryTime');
    expect(body.summary).toHaveProperty('queriesLast24h');
    expect(body.summary.queriesLast24h).toBeGreaterThanOrEqual(2);
    // usageOverTime should have real data
    expect(body.usageOverTime).toHaveLength(14);
    const today = new Date().toISOString().split('T')[0];
    const todayEntry = body.usageOverTime.find((d: any) => d.date === today);
    expect(todayEntry).toBeDefined();
    expect(todayEntry.queries).toBeGreaterThanOrEqual(2);
  });
});

// ===== STORY 4: Embedding Space from Actual Data =====
describe('Admin Routes — Embedding Space Real Data (STORY 4)', () => {
  it('GET /api/admin/analytics returns hasRealEmbeddingData flag', async () => {
    const res = await app.request('/api/admin/analytics', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.summary).toHaveProperty('hasRealEmbeddingData');
    // embeddingSpace should be an array (may be empty if no data)
    expect(Array.isArray(body.embeddingSpace)).toBe(true);
    // If there is real data, each point should have x, y, label
    if (body.embeddingSpace.length > 0) {
      expect(body.embeddingSpace[0]).toHaveProperty('x');
      expect(body.embeddingSpace[0]).toHaveProperty('y');
      expect(body.embeddingSpace[0]).toHaveProperty('label');
    }
  });
});

// ===== STORY 8: Config Reset to Defaults =====
describe('Admin Routes — Config Reset to Defaults (STORY 8)', () => {
  it('POST /api/admin/config/:section/reset clears overrides for section', async () => {
    // First set an override
    await app.request('/api/admin/config/server/logLevel', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ value: 'trace' }),
    });

    // Now reset the server section
    const res = await app.request('/api/admin/config/server/reset', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.section).toBe('server');
    expect(body.config).toHaveProperty('port');
    expect(body.config).toHaveProperty('logLevel');
    // logLevel should be back to default (not 'trace')
    expect(body.config.logLevel).not.toBe('trace');
  });

  it('POST /api/admin/config/reset-all clears all overrides', async () => {
    // Set overrides in multiple sections
    await app.request('/api/admin/config/server/logLevel', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ value: 'trace' }),
    });
    await app.request('/api/admin/config/kb/maxEntries', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ value: 999 }),
    });

    // Reset all
    const res = await app.request('/api/admin/config/reset-all', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.config).toHaveProperty('server');
    expect(body.config).toHaveProperty('kb');
    // Values should be defaults
    expect(body.config.server.logLevel).not.toBe('trace');
    expect(body.config.kb.maxEntries).toBe(100000);
  });

  it('POST /api/admin/config/nonexistent/reset returns 404', async () => {
    const res = await app.request('/api/admin/config/nonexistent/reset', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });
});

// ===== STORY 9: Real KB-Based Semantic Search =====
describe('Admin Routes — Real KB Search (STORY 9)', () => {
  it('POST /api/admin/search returns results from real DB or mock fallback', async () => {
    const res = await app.request('/api/admin/search', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query: 'project', debug: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('results');
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    // Each result should have proper structure
    expect(body.results[0]).toHaveProperty('id');
    expect(body.results[0]).toHaveProperty('source');
    expect(body.results[0]).toHaveProperty('content');
    expect(body.results[0]).toHaveProperty('tier');
    expect(body.results[0]).toHaveProperty('score');
  });

  it('POST /api/admin/search with empty query returns empty results', async () => {
    const res = await app.request('/api/admin/search', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query: '' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.results).toHaveLength(0);
  });
});

// ===== STORY 11: Promotion 7-Day Cooldown =====
describe('Admin Routes — Promotion Cooldown (STORY 11)', () => {
  let promoId: string;
  const entryId1 = `cooldown-test-entry-${Date.now()}`;
  const entryId2 = `different-entry-no-cooldown-${Date.now()}`;

  it('POST /api/admin/kb/promotions creates promotion request', async () => {
    const res = await app.request('/api/admin/kb/promotions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ entryId: entryId1, fromTier: 'USER', toTier: 'PROJECT', reason: 'Quality content' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    promoId = body.promotion.id;
  });

  it('POST /api/admin/kb/promotions/:id/review reject sets cooldown', async () => {
    const res = await app.request(`/api/admin/kb/promotions/${promoId}/review`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'reject' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.promotion.status).toBe('rejected');
  });

  it('POST /api/admin/kb/promotions for same entry returns 400 (cooldown)', async () => {
    const res = await app.request('/api/admin/kb/promotions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ entryId: entryId1, fromTier: 'USER', toTier: 'SHARED', reason: 'Try again' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('cooldown');
    expect(body).toHaveProperty('cooldownUntil');
  });

  it('POST /api/admin/kb/promotions for different entry succeeds (no cooldown)', async () => {
    const res = await app.request('/api/admin/kb/promotions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ entryId: entryId2, fromTier: 'USER', toTier: 'PROJECT', reason: 'Fresh entry' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });
});
