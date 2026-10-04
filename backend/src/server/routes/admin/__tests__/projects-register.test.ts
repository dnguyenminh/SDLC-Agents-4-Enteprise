/**
 * tests for project registration and PROJECT_NOT_REGISTERED guard.
 *
 * Tests:
 * - POST /api/admin/projects/register creates/upserts project
 * - GET /api/admin/projects lists registered projects
 * - Idempotent upsert (register twice → success both times)
 * - GET /api/admin/users returns PROJECT_NOT_REGISTERED when project not in registry
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { createAdminRoute } from '../../admin.js';
import { initAdapters } from '../../../../admin/admin-db.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

const TEST_ADMIN_USERNAME = 'admin';
const TEST_ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'test-admin-pw-01';

let app: Hono;
let authToken: string;

beforeAll(async () => {
  await initAdapters();
  app = new Hono();
  const adminRoute = createAdminRoute(logger);
  app.route('/', adminRoute);

  const res = await app.request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
  });
  const data = await res.json() as any;
  authToken = data.token;
});

function authHeaders() {
  return { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' };
}

describe('Project Registration — POST /api/admin/projects/register', () => {
  it('registers a new project', async () => {
    const res = await app.request('/api/admin/projects/register', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ projectId: 'test-proj-001', displayName: 'Test Project', workspacePath: '/tmp/test' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.project).toHaveProperty('project_id', 'test-proj-001');
    expect(body.project).toHaveProperty('display_name', 'Test Project');
    expect(body.project).toHaveProperty('workspace_path', '/tmp/test');
  });

  it('requires projectId', async () => {
    const res = await app.request('/api/admin/projects/register', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ displayName: 'No ID' }),
    });
    expect(res.status).toBe(400);
  });

  it('idempotent upsert — register same project twice', async () => {
    const res1 = await app.request('/api/admin/projects/register', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ projectId: 'test-proj-upsert', displayName: 'Upsert Test', workspacePath: '/tmp/upsert' }),
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json() as any;
    expect(body1.success).toBe(true);

    const res2 = await app.request('/api/admin/projects/register', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ projectId: 'test-proj-upsert', displayName: 'Upsert Test Updated', workspacePath: '/tmp/upsert2' }),
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json() as any;
    expect(body2.success).toBe(true);
    expect(body2.project.display_name).toBe('Upsert Test Updated');
    expect(body2.project.workspace_path).toBe('/tmp/upsert2');
  });

  it('GET /api/admin/projects lists registered projects', async () => {
    const res = await app.request('/api/admin/projects', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('projects');
    expect(Array.isArray(body.projects)).toBe(true);
    const found = body.projects.find((p: any) => p.project_id === 'test-proj-001');
    expect(found).toBeDefined();
    expect(found.display_name).toBe('Test Project');
  });
});

describe('PROJECT_NOT_REGISTERED guard on protected routes', () => {
   it('GET /api/admin/kb/entries returns PROJECT_NOT_REGISTERED for unregistered project', async () => {
     const res = await app.request('/api/admin/kb/entries', {
       headers: { ...authHeaders(), 'X-Project-Id': 'unregistered-project-xyz' },
     });
     expect(res.status).toBe(404);
     const body = await res.json() as any;
     expect(body.__error).toBe(true);
     expect(body.error.code).toBe('PROJECT_NOT_REGISTERED');
     expect(body.error.message).toContain('unregistered-project-xyz');
     expect(body.error.action).toBe('register');
     expect(body.error.projectId).toBe('unregistered-project-xyz');
   });

  it('GET /api/admin/projects bypasses guard (list is allowed)', async () => {
    const res = await app.request('/api/admin/projects', {
      headers: { ...authHeaders(), 'X-Project-Id': 'nonexistent-project-xyz' },
    });
    expect(res.status).toBe(200);
  });

  it('POST /api/admin/projects/register bypasses guard (register itself)', async () => {
    const res = await app.request('/api/admin/projects/register', {
      method: 'POST',
      headers: { ...authHeaders(), 'X-Project-Id': 'new-project-xyz' },
      body: JSON.stringify({ projectId: 'new-project-xyz' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });
});
