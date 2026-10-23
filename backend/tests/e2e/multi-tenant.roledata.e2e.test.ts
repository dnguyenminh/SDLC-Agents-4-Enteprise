/**
 * E2E Multi-Tenant Isolation Tests — KSA-285.
 * This file: roleData enforcement — MCP_ACCESS.allowedServers + KB_READ.allowedTiers.
 * Owns an isolated tenant fixture (unique suffix) — see multi-tenant.fixtures.ts.
 * Run: npm run test:e2e-api
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTenantFixture, cleanupTenantFixture, type TenantFixture } from './multi-tenant.fixtures.js';

const TEST_ID = Date.now().toString().slice(-6) + 'r';

let fx: TenantFixture;

beforeAll(async () => {
  fx = await createTenantFixture(TEST_ID);
});

afterAll(async () => {
  await cleanupTenantFixture(fx);
});

// ============================================================
// 4. roleData Enforcement — MCP_ACCESS.allowedServers
// ============================================================

describe('4. roleData Enforcement — MCP_ACCESS.allowedServers', () => {
  it('editor1 GET /api/admin/mcp/servers → 200, only atlassian visible', async () => {
    const { status, data } = await fx.apiCall('/mcp/servers', {}, fx.editor1Token);
    expect(status).toBe(200);
    expect(data.servers).toBeDefined();
    // If servers exist, only 'atlassian' should be visible
    if (data.servers.length > 0) {
      const serverIds = data.servers.map((s: any) => s.id);
      expect(serverIds.every((id: string) => id === 'atlassian')).toBe(true);
    }
  });

  it('editor1 POST /api/admin/mcp/servers/drawio/restart → 403 (no MCP_MANAGE permission)', async () => {
    const { status, data } = await fx.apiCall('/mcp/servers/drawio/restart', {
      method: 'POST',
    }, fx.editor1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('MCP_MANAGE');
  });

  it('editor1 POST /api/admin/mcp/servers/atlassian/restart → 403 (no MCP_MANAGE permission)', async () => {
    const { status, data } = await fx.apiCall('/mcp/servers/atlassian/restart', {
      method: 'POST',
    }, fx.editor1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('MCP_MANAGE');
  });
});

// ============================================================
// 5. roleData Enforcement — KB_READ.allowedTiers
// ============================================================

describe('5. roleData Enforcement — KB_READ.allowedTiers', () => {
  it('viewer1 GET /api/admin/kb/entries → returns only USER tier entries (filtered)', async () => {
    const { status, data } = await fx.apiCall('/kb/entries', {}, fx.viewer1Token);
    expect(status).toBe(200);
    expect(data.entries).toBeDefined();
    // All returned entries should be USER tier only
    for (const entry of data.entries) {
      const tier = entry.tier || entry.scope || 'SHARED';
      expect(tier).toBe('USER');
    }
  });

  it('editor1 GET /api/admin/kb/entries → returns all tiers (no restriction)', async () => {
    const { status, data } = await fx.apiCall('/kb/entries', {}, fx.editor1Token);
    expect(status).toBe(200);
    expect(data.entries).toBeDefined();
    // editor1 has KB_READ without allowedTiers restriction — sees all
  });
});
