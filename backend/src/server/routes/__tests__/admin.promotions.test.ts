/**
 * Admin route tests — promotion 7-day cooldown (STORY 11).
 * Split from admin.test.ts to keep each file under the CI line-count gate
 * (<=200 lines). No logic changed — tests only relocated.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { setupAdmin } from './admin.helpers.js';

let app: Hono;
let authHeaders: () => Record<string, string>;

beforeAll(async () => {
  const ctx = await setupAdmin();
  app = ctx.app;
  authHeaders = ctx.authHeaders;
});

// ===== STORY 11: Promotion 7-Day Cooldown =====
describe('Admin Routes — Promotion Cooldown (STORY 11)', () => {
  let promoId: string;
  const entryId1 = `cooldown-test-entry-${Date.now()}`;
  const entryId2 = `different-entry-no-cooldown-${Date.now()}`;

  it('POST /api/admin/kb/promotions creates promotion request', async () => {
    const res = await app.request('/api/admin/kb/promotions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ entryId: entryId1, fromTier: 'USER', toTier: 'PROJECT', reason: 'Quality content' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    promoId = body.promotion.id;
  });

  it('POST /api/admin/kb/promotions/:id/review reject sets cooldown', async () => {
    const res = await app.request(`/api/admin/kb/promotions/${promoId}/review`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'reject' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.promotion.status).toBe('rejected');
  });

  it('POST /api/admin/kb/promotions for same entry returns 400 (cooldown)', async () => {
    const res = await app.request('/api/admin/kb/promotions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ entryId: entryId1, fromTier: 'USER', toTier: 'SHARED', reason: 'Try again' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('cooldown');
    expect(body).toHaveProperty('cooldownUntil');
  });

  it('POST /api/admin/kb/promotions for different entry succeeds (no cooldown)', async () => {
    const res = await app.request('/api/admin/kb/promotions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ entryId: entryId2, fromTier: 'USER', toTier: 'PROJECT', reason: 'Fresh entry' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });
});
