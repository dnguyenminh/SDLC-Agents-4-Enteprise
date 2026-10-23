/**
 * E2E API Tests — Admin Portal: RBAC group lifecycle.
 * (Split from admin-api.e2e.test.ts — BR-18 ≤200 lines/file.)
 *
 * Run: npm run test:e2e-api
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { apiCall, ensureServerUp, login, logout } from './admin-api.fixtures.js';

beforeAll(async () => {
  await ensureServerUp();
  await login();
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

afterAll(async () => {
  await logout();
});
