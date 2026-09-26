/**
 * SA4E-214 — E2E regression test for Pega schema persistence wiring.
 *
 * Guards against the defect where HttpServer mounted createPegaSchemaRoutes
 * WITHOUT a dbAdapter, causing POST /store, GET /find and PATCH /update to
 * always return 503 ("Storage service unavailable (no DB adapter)").
 *
 * The global-setup boots the REAL server (src/index.ts) with an isolated temp
 * DB, so this test exercises the actual HttpServer wiring (getDbAdapter()).
 */
import { describe, it, expect } from 'vitest';
import { BASE_URL } from './setup/e2e-config.js';

async function call(method: string, path: string, body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('SA4E-214 — Pega schema persistence endpoints are wired to a dbAdapter', () => {
  it('POST /api/v1/pega/schema/store is reachable (not 503) on a server booted with dbAdapter', async () => {
    const res = await call('POST', '/api/v1/pega/schema/store', {});
    // 503 would mean the storageService was never created (dbAdapter missing).
    // With a valid adapter the request reaches validation and returns 400.
    expect(res.status).not.toBe(503);
    if (res.status === 400) {
      const body = (await res.json()) as any;
      expect(body.error).not.toMatch(/no DB adapter/i);
    }
  });

  it('GET /api/v1/pega/schema/find?ruleType=x is reachable (not 503)', async () => {
    const res = await call('GET', '/api/v1/pega/schema/find?ruleType=SA4E214Regression');
    expect(res.status).not.toBe(503);
    // adapter present -> reaches auth / validation. 401 = auth required, 404 = not found, 400 = bad request
    expect([404, 400, 401]).toContain(res.status);
  });

  it('PATCH /api/v1/pega/schema/update is reachable (not 503)', async () => {
    const res = await call('PATCH', '/api/v1/pega/schema/update', {});
    expect(res.status).not.toBe(503);
    if (res.status === 400) {
      const body = (await res.json()) as any;
      expect(body.error).not.toMatch(/no DB adapter/i);
    }
  });
});
