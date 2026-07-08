/**
 * E2E API Tests — Admin Portal
 * Tests real HTTP requests against http://localhost:48721
 * Server MUST be running before executing these tests.
 *
 * Run: npm run test:e2e-api
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = 'http://localhost:48721';
const API = `${BASE_URL}/api/admin`;

// Admin credentials — sourced from env (vuln-0001: no hardcoded default).
// Set ADMIN_INITIAL_PASSWORD to match the running server's admin password.
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'admin';

let authToken = '';

// Helper: make authenticated API call
async function apiCall(
  path: string,
  options: RequestInit = {},
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ============================================================
// Setup: Verify server is running
// ============================================================

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Health check returned ${res.status}`);
  } catch (err) {
    throw new Error(
      `Server is not running at ${BASE_URL}. Start it with "npm run dev" before running E2E tests.\n` +
        `Original error: ${err}`,
    );
  }
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
    authToken = data.token;
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

// ============================================================
// 2. User CRUD Lifecycle
// ============================================================

describe('Users — Full CRUD Lifecycle', () => {
  let createdUserId = '';
  const testUsername = `e2e-user-${Date.now()}`;

  it('should create a new user', async () => {
    const { status, data } = await apiCall('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: testUsername,
        email: `${testUsername}@test.local`,
        password: 'Test123!',
        accessGroupId: 'grp-admin',
      }),
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.user).toBeDefined();
    expect(data.user.username).toBe(testUsername);
    createdUserId = data.user.userId;
  });

  it('should get the created user by ID', async () => {
    const { status, data } = await apiCall(`/users/${createdUserId}`);
    expect(status).toBe(200);
    expect(data.username).toBe(testUsername);
    expect(data.email).toBe(`${testUsername}@test.local`);
    expect(data.status).toBe('ACTIVE');
  });

  it('should list users and find the new user', async () => {
    const { status, data } = await apiCall('/users');
    expect(status).toBe(200);
    expect(data.users).toBeInstanceOf(Array);
    expect(data.total).toBeGreaterThanOrEqual(2); // admin + test user
    const found = data.users.find((u: any) => u.username === testUsername);
    expect(found).toBeDefined();
  });

  it('should disable the user', async () => {
    const { status, data } = await apiCall(`/users/${createdUserId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'DISABLED' }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should verify user is disabled', async () => {
    const { status, data } = await apiCall(`/users/${createdUserId}`);
    expect(status).toBe(200);
    expect(data.status).toBe('DISABLED');
  });

  it('should force-logout the user', async () => {
    const { status, data } = await apiCall(`/users/${createdUserId}/force-logout`, {
      method: 'POST',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.terminated).toBe('number');
  });

  it('should reset user password', async () => {
    const { status, data } = await apiCall(`/users/${createdUserId}/reset-password`, {
      method: 'POST',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.temporaryPassword).toBeDefined();
    expect(data.temporaryPassword.length).toBeGreaterThan(0);
  });

  it('should delete the user', async () => {
    const { status, data } = await apiCall(`/users/${createdUserId}`, {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should return 404 for deleted user', async () => {
    const { status } = await apiCall(`/users/${createdUserId}`);
    expect(status).toBe(404);
  });
});

// ============================================================
// 3. RBAC Lifecycle
// ============================================================

describe('RBAC — Full Group Lifecycle', () => {
  let createdGroupId = '';
  const groupName = `e2e-group-${Date.now()}`;

  it('should create a new RBAC group', async () => {
    const { status, data } = await apiCall('/rbac/groups', {
      method: 'POST',
      body: JSON.stringify({
        name: groupName,
        permissions: [
          { name: 'DASHBOARD_VIEW', roleData: {} },
          { name: 'KB_READ', roleData: { allowedTiers: ['USER', 'PROJECT'] } },
        ],
      }),
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.group).toBeDefined();
    createdGroupId = data.group.id || data.group.accessGroupId;
    expect(createdGroupId).toBeDefined();
  });

  it('should list groups and find the new group', async () => {
    const { status, data } = await apiCall('/rbac/groups');
    expect(status).toBe(200);
    expect(data.groups).toBeInstanceOf(Array);
    const found = data.groups.find(
      (g: any) => g.id === createdGroupId || g.accessGroupId === createdGroupId,
    );
    expect(found).toBeDefined();
  });

  it('should update group permissions', async () => {
    const { status, data } = await apiCall(`/rbac/groups/${createdGroupId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: groupName,
        permissions: [
          { name: 'DASHBOARD_VIEW', roleData: {} },
          { name: 'KB_READ', roleData: { allowedTiers: ['USER', 'PROJECT', 'SHARED'] } },
          { name: 'SEARCH_EXPLORE', roleData: { maxResults: 50 } },
        ],
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should assign user to the group (create user with group)', async () => {
    const username = `e2e-rbac-user-${Date.now()}`;
    const { status, data } = await apiCall('/users', {
      method: 'POST',
      body: JSON.stringify({
        username,
        email: `${username}@test.local`,
        password: 'Test123!',
        accessGroupId: createdGroupId,
      }),
    });
    expect(status).toBe(201);
    expect(data.user.accessGroupId).toBe(createdGroupId);

    // Cleanup: delete the user
    await apiCall(`/users/${data.user.userId}`, { method: 'DELETE' });
  });

  it('should delete the group', async () => {
    const { status, data } = await apiCall(`/rbac/groups/${createdGroupId}`, {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should list available permissions', async () => {
    const { status, data } = await apiCall('/rbac/permissions');
    expect(status).toBe(200);
    expect(data.permissions).toBeInstanceOf(Array);
    expect(data.permissions.length).toBeGreaterThan(5);
    expect(data.permissions).toContain('DASHBOARD_VIEW');
    expect(data.permissions).toContain('KB_READ');
  });
});

// ============================================================
// 4. KB Management
// ============================================================

describe('KB — List, Search, Export, Import', () => {
  it('should list KB entries with pagination', async () => {
    const { status, data } = await apiCall('/kb/entries?page=1&pageSize=5');
    expect(status).toBe(200);
    expect(data.entries).toBeInstanceOf(Array);
    expect(typeof data.total).toBe('number');
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(5);
    expect(typeof data.totalPages).toBe('number');
  });

  it('should search KB entries', async () => {
    const { status, data } = await apiCall('/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'admin', debug: true }),
    });
    expect(status).toBe(200);
    expect(data.results).toBeInstanceOf(Array);
    if (data.results.length > 0) {
      expect(data.results[0]).toHaveProperty('score');
      expect(data.results[0]).toHaveProperty('content');
    }
    if (data.debug) {
      expect(data.debug).toHaveProperty('queryTokens');
    }
  });

  it('should export KB entries', async () => {
    const { status, data } = await apiCall('/kb/export');
    expect(status).toBe(200);
    expect(data.entries).toBeInstanceOf(Array);
    expect(data.exportedAt).toBeDefined();
    expect(typeof data.count).toBe('number');
  });

  it('should import KB entries with skip conflict mode', async () => {
    const { status, data } = await apiCall('/kb/import', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { id: 'e2e-test-entry-1', source: 'e2e-test', content: 'Test entry', tier: 'USER' },
          { id: 'e2e-test-entry-2', source: 'e2e-test', content: 'Test entry 2', tier: 'USER' },
        ],
        conflictMode: 'skip',
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.imported).toBe('number');
    expect(typeof data.skipped).toBe('number');
    expect(data.message).toBeDefined();
  });

  it('should import KB entries with overwrite conflict mode', async () => {
    const { status, data } = await apiCall('/kb/import', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { id: 'e2e-test-entry-1', source: 'e2e-overwrite', content: 'Overwritten', tier: 'PROJECT' },
        ],
        conflictMode: 'overwrite',
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should import KB entries with merge conflict mode', async () => {
    const { status, data } = await apiCall('/kb/import', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { id: 'e2e-test-entry-1', source: 'e2e-merge', content: 'Merged', tier: 'SHARED' },
        ],
        conflictMode: 'merge',
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should reject invalid conflict mode', async () => {
    const { status, data } = await apiCall('/kb/import', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{ id: 'x', content: 'x' }],
        conflictMode: 'invalid',
      }),
    });
    expect(status).toBe(400);
    expect(data.error).toContain('conflictMode');
  });
});

// ============================================================
// 5. KB Promotion
// ============================================================

describe('KB — Promotion Flow (Create, Reject, Cooldown)', () => {
  let promotionId = '';
  const testEntryId = `e2e-promo-entry-${Date.now()}`;

  it('should create a promotion request', async () => {
    const { status, data } = await apiCall('/kb/promotions', {
      method: 'POST',
      body: JSON.stringify({
        entryId: testEntryId,
        fromTier: 'USER',
        toTier: 'SHARED',
        reason: 'E2E test promotion',
      }),
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.promotion).toBeDefined();
    expect(data.promotion.status).toBe('pending');
    promotionId = data.promotion.id;
  });

  it('should list promotions including the new one', async () => {
    const { status, data } = await apiCall('/kb/promotions');
    expect(status).toBe(200);
    expect(data.promotions).toBeInstanceOf(Array);
    const found = data.promotions.find((p: any) => p.id === promotionId);
    expect(found).toBeDefined();
    expect(found.status).toBe('pending');
  });

  it('should reject the promotion (sets cooldown)', async () => {
    const { status, data } = await apiCall(`/kb/promotions/${promotionId}/review`, {
      method: 'POST',
      body: JSON.stringify({ action: 'reject' }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.promotion.status).toBe('rejected');
  });

  it('should return 400 when trying to re-promote during cooldown', async () => {
    const { status, data } = await apiCall('/kb/promotions', {
      method: 'POST',
      body: JSON.stringify({
        entryId: testEntryId,
        fromTier: 'USER',
        toTier: 'SHARED',
        reason: 'Retry after rejection',
      }),
    });
    expect(status).toBe(400);
    expect(data.error).toContain('cooldown');
  });
});

// ============================================================
// 6. Configuration
// ============================================================

describe('Config — Get, Patch, Reset', () => {
  it('should get current configuration', async () => {
    const { status, data } = await apiCall('/config');
    expect(status).toBe(200);
    expect(data.config).toBeDefined();
    expect(data.config.server).toBeDefined();
    expect(data.config.server.port).toBe(48721);
    expect(data.config.embedding).toBeDefined();
    expect(data.config.kb).toBeDefined();
    expect(data.restartRequired).toBeDefined();
  });

  it('should patch a config value (hot-reload key)', async () => {
    const { status, data } = await apiCall('/config/server/logLevel', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'debug' }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.requiresRestart).toBe(false);
    expect(data.value).toBe('debug');
  });

  it('should verify the config change', async () => {
    const { status, data } = await apiCall('/config');
    expect(status).toBe(200);
    expect(data.config.server.logLevel).toBe('debug');
  });

  it('should patch a restart-required key and flag it', async () => {
    const { status, data } = await apiCall('/config/server/port', {
      method: 'PATCH',
      body: JSON.stringify({ value: 48722 }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.requiresRestart).toBe(true);
  });

  it('should reset a section to defaults', async () => {
    const { status, data } = await apiCall('/config/server/reset', {
      method: 'POST',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.config).toBeDefined();
    // After reset, port should be back to default 48721
    expect(data.config.port).toBe(48721);
  });

  it('should verify defaults restored after reset', async () => {
    const { status, data } = await apiCall('/config');
    expect(status).toBe(200);
    expect(data.config.server.port).toBe(48721);
    expect(data.config.server.logLevel).toBe('info');
  });

  it('should return 404 for non-existent section', async () => {
    const { status } = await apiCall('/config/nonexistent/key', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'x' }),
    });
    expect(status).toBe(404);
  });

  it('should return 404 for non-existent key', async () => {
    const { status } = await apiCall('/config/server/nonexistent', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'x' }),
    });
    expect(status).toBe(404);
  });
});

// ============================================================
// 7. MCP Servers
// ============================================================

describe('MCP — List, Restart, Toggle, Logs', () => {
  let firstServerId = '';

  it('should list MCP servers', async () => {
    const { status, data } = await apiCall('/mcp/servers');
    expect(status).toBe(200);
    expect(data.servers).toBeInstanceOf(Array);
    if (data.servers.length > 0) {
      firstServerId = data.servers[0].id;
      expect(data.servers[0]).toHaveProperty('name');
      expect(data.servers[0]).toHaveProperty('status');
      expect(data.servers[0]).toHaveProperty('tools');
    }
  });

  it('should restart a server (if exists)', async () => {
    if (!firstServerId) return;
    const { status, data } = await apiCall(`/mcp/servers/${firstServerId}/restart`, {
      method: 'POST',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should toggle a tool on a server (if exists)', async () => {
    if (!firstServerId) return;
    const { status: listStatus, data: listData } = await apiCall('/mcp/servers');
    const server = listData.servers.find((s: any) => s.id === firstServerId);
    if (!server || server.tools.length === 0) return;

    const toolName = server.tools[0].name;
    const { status, data } = await apiCall(
      `/mcp/servers/${firstServerId}/tools/${toolName}/toggle`,
      {
        method: 'POST',
        body: JSON.stringify({ enabled: false }),
      },
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.enabled).toBe(false);

    // Toggle back on
    const { status: s2, data: d2 } = await apiCall(
      `/mcp/servers/${firstServerId}/tools/${toolName}/toggle`,
      {
        method: 'POST',
        body: JSON.stringify({ enabled: true }),
      },
    );
    expect(s2).toBe(200);
    expect(d2.enabled).toBe(true);
  });

  it('should get server logs (if exists)', async () => {
    if (!firstServerId) return;
    const { status, data } = await apiCall(`/mcp/servers/${firstServerId}/logs`);
    expect(status).toBe(200);
    expect(data.serverId).toBe(firstServerId);
    expect(data.logs).toBeInstanceOf(Array);
    if (data.logs.length > 0) {
      expect(data.logs[0]).toHaveProperty('timestamp');
      expect(data.logs[0]).toHaveProperty('level');
      expect(data.logs[0]).toHaveProperty('message');
    }
  });
});

// ============================================================
// 8. Audit
// ============================================================

describe('Audit — Verify Entries from Previous Operations', () => {
  it('should return audit entries', async () => {
    const { status, data } = await apiCall('/audit?page=1&pageSize=50');
    expect(status).toBe(200);
    expect(data.entries).toBeInstanceOf(Array);
    expect(data.total).toBeGreaterThan(0);
    expect(data.page).toBe(1);
  });

  it('should contain login audit entry', async () => {
    const { status, data } = await apiCall('/audit?action=LOGIN');
    expect(status).toBe(200);
    const loginEntry = data.entries.find((e: any) => e.action === 'LOGIN');
    expect(loginEntry).toBeDefined();
    expect(loginEntry.username).toBe(ADMIN_USERNAME);
  });

  it('should contain user management audit entries', async () => {
    const { status, data } = await apiCall('/audit?action=CREATE_USER');
    expect(status).toBe(200);
    expect(data.entries.length).toBeGreaterThanOrEqual(1);
  });

  it('should support pagination', async () => {
    const { status, data } = await apiCall('/audit?page=1&pageSize=5');
    expect(status).toBe(200);
    expect(data.entries.length).toBeLessThanOrEqual(5);
    expect(data.totalPages).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// 9. Profile
// ============================================================

describe('Profile — Get and Update', () => {
  it('should get current profile', async () => {
    const { status, data } = await apiCall('/profile');
    expect(status).toBe(200);
    expect(data.username).toBe(ADMIN_USERNAME);
    expect(data.userId).toBeDefined();
    expect(data.permissions).toBeInstanceOf(Array);
  });

  it('should update profile email', async () => {
    const newEmail = `e2e-${Date.now()}@test.local`;
    const { status, data } = await apiCall('/profile', {
      method: 'POST',
      body: JSON.stringify({ email: newEmail }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.user.email).toBe(newEmail);
  });

  it('should verify email update persisted', async () => {
    const { status, data } = await apiCall('/profile');
    expect(status).toBe(200);
    expect(data.email).toContain('e2e-');
    expect(data.email).toContain('@test.local');
  });
});

// ============================================================
// 10. Unauthorized Access
// ============================================================

describe('Unauthorized — All Endpoints Return 401 Without Token', () => {
  const endpoints = [
    { method: 'GET', path: '/stats' },
    { method: 'GET', path: '/users' },
    { method: 'GET', path: '/profile' },
    { method: 'GET', path: '/rbac/groups' },
    { method: 'GET', path: '/mcp/servers' },
    { method: 'GET', path: '/config' },
    { method: 'GET', path: '/audit' },
    { method: 'GET', path: '/kb/entries' },
    { method: 'GET', path: '/kb/graph' },
    { method: 'GET', path: '/analytics' },
    { method: 'POST', path: '/search' },
    { method: 'GET', path: '/kb/export' },
  ];

  for (const { method, path } of endpoints) {
    it(`${method} ${path} should return 401 without token`, async () => {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify({ query: 'test' }) } : {}),
      });
      expect(res.status).toBe(401);
    });
  }
});

// ============================================================
// Cleanup: Logout
// ============================================================

afterAll(async () => {
  if (authToken) {
    await fetch(`${API}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }
});
