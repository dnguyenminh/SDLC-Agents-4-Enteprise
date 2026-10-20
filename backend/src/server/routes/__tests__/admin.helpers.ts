/**
 * Shared setup for Admin route tests.
 * Split from admin.test.ts to keep each file under the CI line-count gate
 * (<=200 lines). No logic changed — setup relocated.
 *
 * Uses real SQLite DB (admin.db) and real auth flow.
 * Default user: admin/admin (seeded on init).
 */
import { Hono } from 'hono';
import pino from 'pino';
import { createAdminRoute } from '../admin.js';
import { initAdapters } from '../../../admin/admin-db.js';

// Admin credentials from env (set by tests/vitest.setup.ts) — no hardcoded
// default (vuln-0001). Kept inline to avoid importing across the src rootDir.
export const TEST_ADMIN_USERNAME = 'admin';
export const TEST_ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'test-admin-pw-01';

const logger = pino({ level: 'silent' });

export interface AdminTestCtx {
  app: Hono;
  authToken: string;
  authHeaders: () => Record<string, string>;
}

export async function setupAdmin(): Promise<AdminTestCtx> {
  // Await shared DB init (schema + admin seed) — getDbAdapter() inits
  // fire-and-forget, so login would otherwise race seeding and 401.
  await initAdapters();
  const app = new Hono();
  const adminRoute = createAdminRoute(logger);
  app.route('/', adminRoute);

  // Login to get real token
  const res = await app.request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
  });
  const data = await res.json() as any;
  const authToken = data.token;

  return {
    app,
    authToken,
    authHeaders: () => ({ Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' }),
  };
}
