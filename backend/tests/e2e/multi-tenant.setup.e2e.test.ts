/**
 * E2E Multi-Tenant Isolation Tests — KSA-285.
 * This file: setup assertions (create RBAC groups/users) + cleanup assertions.
 * Run: npm run test:e2e-api
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { API_URL } from './setup/e2e-config.js';
import { assertServerUp, loginAdmin, apiCallAs } from './multi-tenant.fixtures.js';

const TEST_ID = Date.now().toString().slice(-6);

const viewer1User = `viewer1-${TEST_ID}`;
const editor1User = `editor1-${TEST_ID}`;
const limitedGroup = `limited-viewers-${TEST_ID}`;
const fullGroup = `full-editors-${TEST_ID}`;

let apiCall: ReturnType<typeof apiCallAs>;
let limitedViewersGroupId = '';
let fullEditorsGroupId = '';
let viewer1UserId = '';
let editor1UserId = '';
let viewer1Token = '';
let editor1Token = '';

beforeAll(async () => {
  await assertServerUp();
  apiCall = apiCallAs(await loginAdmin());
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
    const res = await fetch(`${API_URL}/auth/login`, {
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
    const res = await fetch(`${API_URL}/auth/login`, {
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
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should delete editor1 user', async () => {
    const { status, data } = await apiCall(`/users/${editor1UserId}`, {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should delete limited-viewers group', async () => {
    const { status, data } = await apiCall(`/rbac/groups/${limitedViewersGroupId}`, {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should delete full-editors group', async () => {
    const { status, data } = await apiCall(`/rbac/groups/${fullEditorsGroupId}`, {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});
