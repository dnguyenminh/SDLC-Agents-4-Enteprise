/**
 * Shared setup for SA4E-215 route integration tests.
 * Split from sa4e-215.routes.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — setup relocated.
 *
 * Runs against an isolated SQLite instance (the platform's unified adapter in
 * the temp test workspace provisioned by vitest.setup.ts). The DB is fresh per
 * test run and seeded by initSchema/seedDefaults, then SA4E-215 tables are
 * created via ensureSa4e215Tables().
 */
import { expect } from 'vitest';
import { Hono } from 'hono';
import { getDbAdapter, initAdapters } from '../../../../admin/admin-db.js';
import { ensureSa4e215Tables } from '../../../../database/schema-registry/ensure-sa4e-215.js';
import { createSa4e215Route } from '../index.js';

export const PROJECT = 'prj-sa4e215-test';
export const PROJECT_2 = 'prj-sa4e215-test-2';

export interface Sa4e215Ctx {
  app: Hono;
  token: string;
  json: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>;
  authHeaders: () => Promise<Record<string, string>>;
}

export async function setupSa4e215(): Promise<Sa4e215Ctx> {
  const app = new Hono();
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
  const reg = await request(app, 'POST', '/auth/register', { email, password: pw, access_group_id: 'grp-dev' });
  expect(reg.status).toBe(200);
  const login = await request(app, 'POST', '/auth/login', { email, password: pw });
  const data = (await login.json()) as any;
  expect(data.success).toBe(true);
  expect(data.data.token).toBeTruthy();
  const token: string = data.data.token;

  return {
    app,
    token,
    json: (method, path, body, headers) => request(app, method, path, body, headers),
    authHeaders: async () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
  };
}

async function request(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
