/**
 * E2E Multi-Tenant Isolation Tests — KSA-285.
 * This file: permission enforcement on endpoints + CONFIG_EDIT.readOnly roleData.
 * Owns an isolated tenant fixture (unique suffix) — see multi-tenant.fixtures.ts.
 * Run: npm run test:e2e-api
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTenantFixture, cleanupTenantFixture, type TenantFixture } from './multi-tenant.fixtures.js';

// Unique suffix so this file's tenant never collides with the other split files.
const TEST_ID = Date.now().toString().slice(-6) + 'p';

let fx: TenantFixture;

beforeAll(async () => {
  fx = await createTenantFixture(TEST_ID);
});

afterAll(async () => {
  await cleanupTenantFixture(fx);
});

// ============================================================
// 2. Permission Enforcement — Endpoint Access
// ============================================================

describe('2. Permission Enforcement — Endpoint Access', () => {
  it('viewer1 cannot access /api/admin/users (no USER_MANAGE) → 403', async () => {
    const { status, data } = await fx.apiCall('/users', {}, fx.viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('USER_MANAGE');
  });

  it('viewer1 cannot access /api/admin/rbac/groups (no RBAC_MANAGE) → 403', async () => {
    const { status, data } = await fx.apiCall('/rbac/groups', {}, fx.viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('RBAC_MANAGE');
  });

  it('viewer1 cannot access /api/admin/config (no CONFIG_EDIT) → 403', async () => {
    const { status, data } = await fx.apiCall('/config', {}, fx.viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('CONFIG_EDIT');
  });

  it('viewer1 cannot PATCH config (no CONFIG_EDIT) → 403', async () => {
    const { status, data } = await fx.apiCall('/config/server/logLevel', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'debug' }),
    }, fx.viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('CONFIG_EDIT');
  });

  it('viewer1 CAN access /api/admin/stats (has DASHBOARD_VIEW) → 200', async () => {
    const { status, data } = await fx.apiCall('/stats', {}, fx.viewer1Token);
    expect(status).toBe(200);
    expect(data.kbEntries).toBeDefined();
    expect(data.uptime).toBeDefined();
  });

  it('editor1 CAN access /api/admin/config → 200', async () => {
    const { status, data } = await fx.apiCall('/config', {}, fx.editor1Token);
    expect(status).toBe(200);
    expect(data.config).toBeDefined();
  });

  it('editor1 cannot PATCH config (readOnly: true overrides) → 403', async () => {
    const { status, data } = await fx.apiCall('/config/server/logLevel', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'debug' }),
    }, fx.editor1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('read-only');
  });
});

// ============================================================
// 3. roleData Enforcement — CONFIG_EDIT.readOnly
// ============================================================

describe('3. roleData Enforcement — CONFIG_EDIT.readOnly', () => {
  it('editor1 has CONFIG_EDIT with readOnly=true — GET /api/admin/config → 200', async () => {
    const { status, data } = await fx.apiCall('/config', {}, fx.editor1Token);
    expect(status).toBe(200);
    expect(data.config).toBeDefined();
    expect(data.config.server).toBeDefined();
  });

  it('editor1 PATCH /api/admin/config/server/logLevel → 403 (readOnly blocks write)', async () => {
    const { status, data } = await fx.apiCall('/config/server/logLevel', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'trace' }),
    }, fx.editor1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('read-only');
  });
});
