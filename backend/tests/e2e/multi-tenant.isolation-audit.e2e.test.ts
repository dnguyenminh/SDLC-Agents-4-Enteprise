/**
 * E2E Multi-Tenant Isolation Tests — KSA-285.
 * This file: cross-user isolation + audit isolation.
 * Owns an isolated tenant fixture (unique suffix) — see multi-tenant.fixtures.ts.
 * Run: npm run test:e2e-api
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTenantFixture, cleanupTenantFixture, type TenantFixture } from './multi-tenant.fixtures.js';

const TEST_ID = Date.now().toString().slice(-6) + 'i';

let fx: TenantFixture;

beforeAll(async () => {
  fx = await createTenantFixture(TEST_ID);
});

afterAll(async () => {
  await cleanupTenantFixture(fx);
});

// ============================================================
// 6. Cross-User Isolation
// ============================================================

describe('6. Cross-User Isolation', () => {
  it('viewer1 cannot see editor1 user details (no USER_MANAGE) → 403', async () => {
    const { status, data } = await fx.apiCall(`/users/${fx.editor1UserId}`, {}, fx.viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('USER_MANAGE');
  });

  it('viewer1 cannot force-logout editor1 (no USER_MANAGE) → 403', async () => {
    const { status, data } = await fx.apiCall(`/users/${fx.editor1UserId}/force-logout`, {
      method: 'POST',
    }, fx.viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('USER_MANAGE');
  });

  it('viewer1 cannot create users (no USER_MANAGE) → 403', async () => {
    const { status, data } = await fx.apiCall('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'hacker',
        password: 'hacker123',
        accessGroupId: fx.limitedViewersGroupId,
      }),
    }, fx.viewer1Token);
    expect(status).toBe(403);
  });

  it('viewer1 cannot create groups (no RBAC_MANAGE) → 403', async () => {
    const { status, data } = await fx.apiCall('/rbac/groups', {
      method: 'POST',
      body: JSON.stringify({ name: 'hacker-group', permissions: [] }),
    }, fx.viewer1Token);
    expect(status).toBe(403);
  });

  it('viewer1 cannot modify config (no CONFIG_EDIT) → 403', async () => {
    const { status } = await fx.apiCall('/config/server/logLevel', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'error' }),
    }, fx.viewer1Token);
    expect(status).toBe(403);
  });
});

// ============================================================
// 7. Audit Isolation
// ============================================================

describe('7. Audit Isolation', () => {
  it('viewer1 has no AUDIT_VIEW → GET /api/admin/audit → 403', async () => {
    const { status, data } = await fx.apiCall('/audit', {}, fx.viewer1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('AUDIT_VIEW');
  });

  it('editor1 has no AUDIT_VIEW → GET /api/admin/audit → 403', async () => {
    const { status, data } = await fx.apiCall('/audit', {}, fx.editor1Token);
    expect(status).toBe(403);
    expect(data.error).toContain('AUDIT_VIEW');
  });

  it('admin (with AUDIT_VIEW) CAN see audit logs → 200', async () => {
    const { status, data } = await fx.apiCall('/audit', {}, fx.adminToken);
    expect(status).toBe(200);
    expect(data.entries).toBeDefined();
    expect(Array.isArray(data.entries)).toBe(true);
  });
});
