/**
 * E2E API Tests — Admin Portal: Users CRUD + Audit verification.
 * (Split from admin-api.e2e.test.ts — BR-18 ≤200 lines/file.)
 * Users and Audit stay in one file: the Audit assertions depend on the
 * CREATE_USER entries produced by the Users lifecycle above.
 *
 * Run: npm run test:e2e-api
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  ADMIN_USERNAME,
  apiCall,
  ensureServerUp,
  login,
  logout,
} from './admin-api.fixtures.js';

beforeAll(async () => {
  await ensureServerUp();
  await login();
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

afterAll(async () => {
  await logout();
});
