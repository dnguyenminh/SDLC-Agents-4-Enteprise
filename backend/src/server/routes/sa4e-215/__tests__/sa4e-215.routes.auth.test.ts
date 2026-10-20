/**
 * SA4E-215 — Route integration tests (auth endpoints).
 * No live server required — routes are exercised through Hono's app.request().
 * Split from sa4e-215.routes.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — tests only relocated.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { setupSa4e215, type Sa4e215Ctx } from './sa4e-215.helpers.js';

let json: Sa4e215Ctx['json'];

beforeAll(async () => {
  const ctx = await setupSa4e215();
  json = ctx.json;
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
