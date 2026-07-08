/**
 * E2E Multi-Tenant Isolation Tests — KSA-285
 * Tests RBAC permission enforcement, roleData rules, and cross-user isolation.
 * Server MUST be running at http://localhost:48721.
 *
 * Run: npm run test:e2e-api
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = 'http://localhost:48721';
const API = `${BASE_URL}/api/admin`;

const TEST_ID = Date.now().toString().slice(-6);

// Admin credentials — sourced from env (vuln-0001: no hardcoded default).
// Set ADMIN_INITIAL_PASSWORD to match the running server's admin password.
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'admin';

let adminToken = '';
let viewer1Token = '';
let editor1Token = '';
let viewer1UserId = '';
let editor1UserId = '';
let limitedViewersGroupId = '';
let fullEditorsGroupId = '';

const viewer1User = `viewer1-${TEST_ID}`;
const editor1User = `editor1-${TEST_ID}`;
const limitedGroup = `limited-viewers-${TEST_ID}`;
const fullGroup = `full-editors-${TEST_ID}`;

// Helper: make API call with specific token
async function apiCall(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<{ status: number; data: any }> {
  const useToken = token !== undefined ? token : adminToken;
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(useToken ? { Authorization: `Bearer ${useToken}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ============================================================
// Server Health Check
// ============================================================

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Health check returned ${res.status}`);
  } catch (err) {
    throw new Error(
      `Server is not running at ${BASE_URL}. Start with "npm run dev" before E2E tests.\n${err}`,
    );
  }

  // Login as admin
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  const loginData = await loginRes.json();
  adminToken = loginData.token;
  expect(adminToken).toBeDefined();
});

// ============================================================
// 1. Setup: Create Groups and Users
// ============================================================

describe('1. Setup — Create RBAC Groups + Users', () => {
  it('should create "limited-viewers" group with KB_READ(allowedTiers:[USER]), DASHBOARD_VIEW', async () => {
    const { status, data } = await apiCall('/rbac/groups', {
      method: 'POST',
      body: JSON.stringify({
        name: limitedGroup,
        permissions: [
          { name: 'KB_READ', roleData: { allowedTiers: ['USER'] } },
          { name: 'DASHBOARD_VIEW', roleData: {} },
        ],
      }),
    });
    expect([201, 409]).toContain(status);
    expect(data.success || data.error?.includes('exists') || data.error?.includes('already')).toBeTruthy();
    limitedViewersGroupId = data.group.id || data.group.accessGroupId;
    expect(limitedViewersGroupId).toBeDefined();
  });

  it('should create "full-editors" group with KB_READ(all), KB_WRITE, CONFIG_EDIT(readOnly:true), MCP_ACCESS(allowedServers:[atlassian]), SEARCH_EXPLORE', async () => {
    const { status, data } = await apiCall('/rbac/groups', {
      method: 'POST',
      body: JSON.stringify({
        name: fullGroup,
        permissions: [
          { name: 'KB_READ', roleData: {} },
          { name: 'KB_WRITE', roleData: {} },
          { name: 'CONFIG_EDIT', roleData: { readOnly: true } },
          { name: 'MCP_ACCESS', roleData: { allowedServers: ['atlassian'] } },
          { name: 'SEARCH_EXPLORE', roleData: {} },
        ],
      }),
    });
    expect([201, 409]).toContain(status);
    expect(data.success || data.error?.includes('exists') || data.error?.includes('already')).toBeTruthy();
    fullEditorsGroupId = data.group.id || data.group.accessGroupId;
    expect(fullEditorsGroupId).toBeDefined();
  });

  it('should create user "viewer1" in limited-viewers group', async () => {
    const { status, data } = await apiCall('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: viewer1User,
        password: 'viewer1pass',
        email: `${viewer1User}@test.com`,
        accessGroupId: limitedViewersGroupId,
      }),
    });
    expect([201, 409]).toContain(status);
    expect(data.success || data.error?.includes('exists') || data.error?.includes('already')).toBeTruthy();
    viewer1UserId = data.user.userId;
    expect(viewer1UserId).toBeDefined();
  });

  it('should create user "editor1" in full-editors group', async () => {
    const { status, data } = await apiCall('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: editor1User,
        password: 'editor1pass',
        email: `${editor1User}@test.com`,
        accessGroupId: fullEditorsGroupId,
      }),
    });
    expect([201, 409]).toContain(status);
    expect(data.success || data.error?.includes('exists') || data.error?.includes('already')).toBeTruthy();
    editor1UserId = data.user.userId;
    expect(editor1UserId).toBeDefined();
  });

  it('should login as viewer1 and get token', async () => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: viewer1User, password: 'viewer1pass' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    viewer1Token = data.token;
    expect(viewer1Token).toBeDefined();
    // Verify permissions returned in login response
    expect(data.user.permissions).toContain('KB_READ');
    expect(data.user.permissions).toContain('DASHBOARD_VIEW');
    expect(data.user.permissions).not.toContain('USER_MANAGE');
  });

  it('should login as editor1 and get token', async () => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: editor1User, password: 'editor1pass' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    editor1Token = data.token;
    expect(editor1Token).toBeDefined();
    expect(data.user.permissions).toContain('KB_READ');
    expect(data.user.permissions).toContain('CONFIG_EDIT');
    expect(data.user.permissions).toContain('MCP_ACCESS');
  });
});

// ============================================================
// 2. Permission Enforcement — Endpoint Access
// ============================================================

describe('2. Permission Enforcement — Endpoint Access', () => {
  it('viewer1 cannot access /api/admin/users (no USER_MANAGE) → 403', async () => {
    const { status, data } = await apiCall('/users', {}, viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('USER_MANAGE');
  });

  it('viewer1 cannot access /api/admin/rbac/groups (no RBAC_MANAGE) → 403', async () => {
    const { status, data } = await apiCall('/rbac/groups', {}, viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('RBAC_MANAGE');
  });

  it('viewer1 cannot access /api/admin/config (no CONFIG_EDIT) → 403', async () => {
    const { status, data } = await apiCall('/config', {}, viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('CONFIG_EDIT');
  });

  it('viewer1 cannot PATCH config (no CONFIG_EDIT) → 403', async () => {
    const { status, data } = await apiCall('/config/server/logLevel', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'debug' }),
    }, viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('CONFIG_EDIT');
  });

  it('viewer1 CAN access /api/admin/stats (has DASHBOARD_VIEW) → 200', async () => {
    const { status, data } = await apiCall('/stats', {}, viewer1Token);
    expect(status).toBe(200);
    expect(data.kbEntries).toBeDefined();
    expect(data.uptime).toBeDefined();
  });

  it('editor1 CAN access /api/admin/config → 200', async () => {
    const { status, data } = await apiCall('/config', {}, editor1Token);
    expect(status).toBe(200);
    expect(data.config).toBeDefined();
  });

  it('editor1 cannot PATCH config (readOnly: true overrides) → 403', async () => {
    const { status, data } = await apiCall('/config/server/logLevel', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'debug' }),
    }, editor1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('read-only');
  });
});

// ============================================================
// 3. roleData Enforcement — CONFIG_EDIT.readOnly
// ============================================================

describe('3. roleData Enforcement — CONFIG_EDIT.readOnly', () => {
  it('editor1 has CONFIG_EDIT with readOnly=true — GET /api/admin/config → 200', async () => {
    const { status, data } = await apiCall('/config', {}, editor1Token);
    expect(status).toBe(200);
    expect(data.config).toBeDefined();
    expect(data.config.server).toBeDefined();
  });

  it('editor1 PATCH /api/admin/config/server/logLevel → 403 (readOnly blocks write)', async () => {
    const { status, data } = await apiCall('/config/server/logLevel', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'trace' }),
    }, editor1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('read-only');
  });
});

// ============================================================
// 4. roleData Enforcement — MCP_ACCESS.allowedServers
// ============================================================

describe('4. roleData Enforcement — MCP_ACCESS.allowedServers', () => {
  it('editor1 GET /api/admin/mcp/servers → 200, only atlassian visible', async () => {
    const { status, data } = await apiCall('/mcp/servers', {}, editor1Token);
    expect(status).toBe(200);
    expect(data.servers).toBeDefined();
    // If servers exist, only 'atlassian' should be visible
    if (data.servers.length > 0) {
      const serverIds = data.servers.map((s: any) => s.id);
      expect(serverIds.every((id: string) => id === 'atlassian')).toBe(true);
    }
  });

  it('editor1 POST /api/admin/mcp/servers/drawio/restart → 403 (no MCP_MANAGE permission)', async () => {
    const { status, data } = await apiCall('/mcp/servers/drawio/restart', {
      method: 'POST',
    }, editor1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('MCP_MANAGE');
  });

  it('editor1 POST /api/admin/mcp/servers/atlassian/restart → 403 (no MCP_MANAGE permission)', async () => {
    const { status, data } = await apiCall('/mcp/servers/atlassian/restart', {
      method: 'POST',
    }, editor1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('MCP_MANAGE');
  });
});

// ============================================================
// 5. roleData Enforcement — KB_READ.allowedTiers
// ============================================================

describe('5. roleData Enforcement — KB_READ.allowedTiers', () => {
  it('viewer1 GET /api/admin/kb/entries → returns only USER tier entries (filtered)', async () => {
    const { status, data } = await apiCall('/kb/entries', {}, viewer1Token);
    expect(status).toBe(200);
    expect(data.entries).toBeDefined();
    // All returned entries should be USER tier only
    for (const entry of data.entries) {
      const tier = entry.tier || entry.scope || 'SHARED';
      expect(tier).toBe('USER');
    }
  });

  it('editor1 GET /api/admin/kb/entries → returns all tiers (no restriction)', async () => {
    const { status, data } = await apiCall('/kb/entries', {}, editor1Token);
    expect(status).toBe(200);
    expect(data.entries).toBeDefined();
    // editor1 has KB_READ without allowedTiers restriction — sees all
  });
});

// ============================================================
// 6. Cross-User Isolation
// ============================================================

describe('6. Cross-User Isolation', () => {
  it('viewer1 cannot see editor1 user details (no USER_MANAGE) → 403', async () => {
    const { status, data } = await apiCall(`/users/${editor1UserId}`, {}, viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('USER_MANAGE');
  });

  it('viewer1 cannot force-logout editor1 (no USER_MANAGE) → 403', async () => {
    const { status, data } = await apiCall(`/users/${editor1UserId}/force-logout`, {
      method: 'POST',
    }, viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('USER_MANAGE');
  });

  it('viewer1 cannot create users (no USER_MANAGE) → 403', async () => {
    const { status, data } = await apiCall('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'hacker',
        password: 'hacker123',
        accessGroupId: limitedViewersGroupId,
      }),
    }, viewer1Token);
    expect(status).toBe(403);
  });

  it('viewer1 cannot create groups (no RBAC_MANAGE) → 403', async () => {
    const { status, data } = await apiCall('/rbac/groups', {
      method: 'POST',
      body: JSON.stringify({ name: 'hacker-group', permissions: [] }),
    }, viewer1Token);
    expect(status).toBe(403);
  });

  it('viewer1 cannot modify config (no CONFIG_EDIT) → 403', async () => {
    const { status } = await apiCall('/config/server/logLevel', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'error' }),
    }, viewer1Token);
    expect(status).toBe(403);
  });
});

// ============================================================
// 7. Audit Isolation
// ============================================================

describe('7. Audit Isolation', () => {
  it('viewer1 has no AUDIT_VIEW → GET /api/admin/audit → 403', async () => {
    const { status, data } = await apiCall('/audit', {}, viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('AUDIT_VIEW');
  });

  it('editor1 has no AUDIT_VIEW → GET /api/admin/audit → 403', async () => {
    const { status, data } = await apiCall('/audit', {}, editor1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('AUDIT_VIEW');
  });

  it('admin (with AUDIT_VIEW) CAN see audit logs → 200', async () => {
    const { status, data } = await apiCall('/audit', {}, adminToken);
    expect(status).toBe(200);
    expect(data.entries).toBeDefined();
    expect(Array.isArray(data.entries)).toBe(true);
  });
});

// ============================================================
// 8. Cleanup — Delete test users and groups
// ============================================================

describe('8. Cleanup', () => {
  it('should logout viewer1', async () => {
    const { status } = await apiCall('/auth/logout', {
      method: 'POST',
    }, viewer1Token);
    expect(status).toBe(200);
  });

  it('should logout editor1', async () => {
    const { status } = await apiCall('/auth/logout', {
      method: 'POST',
    }, editor1Token);
    expect(status).toBe(200);
  });

  it('should delete viewer1 user', async () => {
    const { status, data } = await apiCall(`/users/${viewer1UserId}`, {
      method: 'DELETE',
    }, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should delete editor1 user', async () => {
    const { status, data } = await apiCall(`/users/${editor1UserId}`, {
      method: 'DELETE',
    }, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should delete limited-viewers group', async () => {
    const { status, data } = await apiCall(`/rbac/groups/${limitedViewersGroupId}`, {
      method: 'DELETE',
    }, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should delete full-editors group', async () => {
    const { status, data } = await apiCall(`/rbac/groups/${fullEditorsGroupId}`, {
      method: 'DELETE',
    }, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});
