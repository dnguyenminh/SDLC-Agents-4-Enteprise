/**
 * E2E API Tests — Admin Portal: MCP servers + profile.
 * (Split from admin-api.e2e.test.ts — BR-18 ≤200 lines/file.)
 *
 * Run: npm run test:e2e-api
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ADMIN_USERNAME, apiCall, ensureServerUp, login, logout } from './admin-api.fixtures.js';

beforeAll(async () => {
  await ensureServerUp();
  await login();
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
    // success may be false if child server is unreachable (infrastructure dependency)
    expect(data).toHaveProperty('success');
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

afterAll(async () => {
  await logout();
});
