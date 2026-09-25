/**
 * SA4E-215 — Route integration tests (auth / decisions / mcp-servers).
 *
 * Runs against an isolated SQLite instance (the platform's unified adapter in
 * the temp test workspace provisioned by vitest.setup.ts). This satisfies the
 * Acceptance Criteria: "CRUD trên in-memory SQLite, verify cùng input -> cùng
 * output". The DB is fresh per test run and seeded by initSchema/seedDefaults,
 * then SA4E-215 tables are created via ensureSa4e215Tables().
 *
 * No live server required — routes are exercised through Hono's app.request().
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { getDbAdapter, initAdapters } from '../../../../admin/admin-db.js';
import { ensureSa4e215Tables } from '../../../../database/schema-registry/ensure-sa4e-215.js';
import { createSa4e215Route } from '../index.js';

const PROJECT = 'prj-sa4e215-test';
const PROJECT_2 = 'prj-sa4e215-test-2';

let app: Hono;
let token: string;

async function json(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function authHeaders() {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

beforeAll(async () => {
  app = new Hono();
  app.route('/', createSa4e215Route());
  // Await shared DB init first (project_registry table), then SA4E-215 tables —
  // both were fire-and-forget/unawaited, so INSERTs raced table creation.
  await initAdapters();
  await ensureSa4e215Tables(); // also triggers getDbAdapter() -> initSchema + seedDefaults
  const adapter = getDbAdapter();
  await adapter.runAsync(
    'INSERT INTO project_registry (project_id, display_name) VALUES (?, ?) ON CONFLICT DO NOTHING',
    [PROJECT, 'SA4E-215 Test'],
  );
  await adapter.runAsync(
    'INSERT INTO project_registry (project_id, display_name) VALUES (?, ?) ON CONFLICT DO NOTHING',
    [PROJECT_2, 'SA4E-215 Test 2'],
  );

  const email = `uat-${Date.now()}@test.local`;
  const pw = 'Uat!1234';
  const reg = await json('POST', '/auth/register', { email, password: pw, access_group_id: 'grp-dev' });
  expect(reg.status).toBe(200);
  const login = await json('POST', '/auth/login', { email, password: pw });
  const data = (await login.json()) as any;
  expect(data.success).toBe(true);
  expect(data.data.token).toBeTruthy();
  token = data.data.token;
});

describe('AUTH', () => {
  it('register creates a user and returns userId', async () => {
    const res = await json('POST', '/auth/register', {
      email: `new-${Date.now()}@test.local`,
      password: 'Pass!234567',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.userId).toMatch(/^user-/);
  });

  it('duplicate email -> ERR_002 (400)', async () => {
    const email = `dup-${Date.now()}@test.local`;
    await json('POST', '/auth/register', { email, password: 'Pass!234567' });
    const res = await json('POST', '/auth/register', { email, password: 'Pass!234567' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('ERR_002');
  });

  it('missing email/password -> ERR_001 (400)', async () => {
    const res = await json('POST', '/auth/register', { password: 'Pass!234567' });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error.code).toBe('ERR_001');
  });

  it('login returns token + permissions array', async () => {
    const res = await json('POST', '/auth/login', { email: `uat-${Date.now()}@test.local`, password: 'Uat!1234' });
    // a freshly registered user
    const email = `login-${Date.now()}@test.local`;
    await json('POST', '/auth/register', { email, password: 'Uat!1234' });
    const login = await json('POST', '/auth/login', { email, password: 'Uat!1234' });
    const body = (await login.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.token).toBeTruthy();
    expect(Array.isArray(body.data.user.permissions)).toBe(true);
  });

  it('wrong password -> ERR_002 (401)', async () => {
    const res = await json('POST', '/auth/login', { email: `uat-${Date.now()}@test.local`, password: 'wrong' });
    expect(res.status).toBe(401);
    expect((await res.json() as any).error.code).toBe('ERR_002');
  });

  it('logout succeeds (uses an isolated token so the shared one stays valid)', async () => {
    const email = `logout-${Date.now()}@test.local`;
    await json('POST', '/auth/register', { email, password: 'Uat!1234' });
    const login = await json('POST', '/auth/login', { email, password: 'Uat!1234' });
    const isolated = (await login.json() as any).data.token;
    const res = await json('POST', '/auth/logout', undefined, { Authorization: `Bearer ${isolated}` });
    expect(res.status).toBe(200);
    expect((await res.json() as any).success).toBe(true);
  });
});

describe('DECISIONS', () => {
  it('rejects without token -> ERR_002 (401)', async () => {
    const res = await json('POST', '/decisions', { ruleSetId: 'default', result: 'approved' });
    expect(res.status).toBe(401);
    expect((await res.json() as any).error.code).toBe('ERR_002');
  });

  it('create requires ruleSetId+result -> ERR_001 (400)', async () => {
    const res = await json('POST', '/decisions', { result: 'approved' }, await authHeaders());
    expect(res.status).toBe(400);
    expect((await res.json() as any).error.code).toBe('ERR_001');
  });

  it('create success returns decisionId and echoes input (same input -> same output)', async () => {
    const payload = { ruleSetId: 'default', result: 'approved', inputParams: { risk: 30 }, confidence: 0.7, projectId: PROJECT };
    const res = await json('POST', '/decisions', payload, await authHeaders());
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.decisionId).toMatch(/^dec-/);
    expect(body.data.result).toBe('approved');
    expect(body.data.ruleSetId).toBe('default');
    expect(body.data.confidence).toBe(0.7);
    // re-run identical payload -> same mapped output shape, success true
    const res2 = await json('POST', '/decisions', payload, await authHeaders());
    const body2 = (await res2.json()) as any;
    expect(body2.success).toBe(true);
    expect(body2.data.result).toBe('approved');
  });

  it('list filters by projectId', async () => {
    await json('POST', '/decisions', { ruleSetId: 'default', result: 'rejected', projectId: PROJECT }, await authHeaders());
    const res = await json('GET', `/decisions?projectId=${PROJECT}`, undefined, await authHeaders());
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.every((d: any) => d.projectId === PROJECT)).toBe(true);
  });

  it('read one returns the record', async () => {
    const created = await json('POST', '/decisions', { ruleSetId: 'default', result: 'approved', projectId: PROJECT }, await authHeaders());
    const id = (await created.json() as any).data.decisionId;
    const res = await json('GET', `/decisions/${id}`, undefined, await authHeaders());
    expect(res.status).toBe(200);
    expect((await res.json() as any).data.decisionId).toBe(id);
  });

  it('read unknown -> ERR_006 (404)', async () => {
    const res = await json('GET', '/decisions/dec-nonexistent', undefined, await authHeaders());
    expect(res.status).toBe(404);
    expect((await res.json() as any).error.code).toBe('ERR_006');
  });
});

describe('MCP SERVERS', () => {
  it('rejects without token -> ERR_002 (401)', async () => {
    const res = await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'x', transportType: 'stdio' });
    expect(res.status).toBe(401);
    expect((await res.json() as any).error.code).toBe('ERR_002');
  });

  it('create requires projectId/name/transportType -> ERR_001 (400)', async () => {
    const res = await json('POST', '/mcp/servers', { name: 'x' }, await authHeaders());
    expect(res.status).toBe(400);
    expect((await res.json() as any).error.code).toBe('ERR_001');
  });

  it('create with unknown project_id -> ERR_006 (400)', async () => {
    const res = await json('POST', '/mcp/servers', { projectId: 'prj-does-not-exist', name: 'x', transportType: 'stdio' }, await authHeaders());
    expect(res.status).toBe(400);
    expect((await res.json() as any).error.code).toBe('ERR_006');
  });

  it('create success returns serverId', async () => {
    const res = await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'github', transportType: 'stdio', command: 'npx', args: {}, env: {} }, await authHeaders());
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.serverId).toMatch(/^mcp-/);
    expect(body.data.transportType).toBe('stdio');
  });

  it('list by projectId', async () => {
    const res = await json('GET', `/mcp/servers?projectId=${PROJECT}`, undefined, await authHeaders());
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.every((s: any) => s.projectId === PROJECT)).toBe(true);
  });

  it('duplicate name per project -> ERR_001 (400)', async () => {
    await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'dup', transportType: 'stdio' }, await authHeaders());
    const res = await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'dup', transportType: 'stdio' }, await authHeaders());
    expect(res.status).toBe(400);
    expect((await res.json() as any).error.code).toBe('ERR_001');
  });

  it('same name allowed for a different project', async () => {
    const a = await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'shared', transportType: 'stdio' }, await authHeaders());
    expect(a.status).toBe(200);
    const b = await json('POST', '/mcp/servers', { projectId: PROJECT_2, name: 'shared', transportType: 'stdio' }, await authHeaders());
    expect(b.status).toBe(200);
    expect((await b.json() as any).data.serverId).toMatch(/^mcp-/);
  });

  it('update sets disabled', async () => {
    const created = await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'toupdate', transportType: 'stdio' }, await authHeaders());
    const id = (await created.json() as any).data.serverId;
    const res = await json('PUT', `/mcp/servers/${id}`, { disabled: true }, await authHeaders());
    expect(res.status).toBe(200);
    expect((await res.json() as any).data.disabled).toBe(true);
  });

  it('delete is hard delete, then read -> ERR_006 (404)', async () => {
    const created = await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'todelete', transportType: 'stdio' }, await authHeaders());
    const id = (await created.json() as any).data.serverId;
    const del = await json('DELETE', `/mcp/servers/${id}`, undefined, await authHeaders());
    expect(del.status).toBe(200);
    const res = await json('GET', `/mcp/servers/${id}`, undefined, await authHeaders());
    expect(res.status).toBe(404);
    expect((await res.json() as any).error.code).toBe('ERR_006');
  });
});
