/**
 * E2E API Tests — Admin Portal: KB management + promotion flow.
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
// 4. KB Management
// ============================================================

describe('KB — List, Search, Export, Import', () => {
  it('should list KB entries with pagination', async () => {
    const { status, data } = await apiCall('/kb/entries?page=1&pageSize=5');
    expect(status).toBe(200);
    expect(data.entries).toBeInstanceOf(Array);
    expect(typeof data.total).toBe('number');
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(5);
    expect(typeof data.totalPages).toBe('number');
  });

  it('should search KB entries', async () => {
    const { status, data } = await apiCall('/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'admin', debug: true }),
    });
    expect(status).toBe(200);
    expect(data.results).toBeInstanceOf(Array);
    if (data.results.length > 0) {
      expect(data.results[0]).toHaveProperty('score');
      expect(data.results[0]).toHaveProperty('content');
    }
    if (data.debug) {
      expect(data.debug).toHaveProperty('queryTokens');
    }
  });

  it('should export KB entries', async () => {
    const { status, data } = await apiCall('/kb/export');
    expect(status).toBe(200);
    expect(data.entries).toBeInstanceOf(Array);
    expect(data.exportedAt).toBeDefined();
    expect(typeof data.count).toBe('number');
  });

  it('should import KB entries with skip conflict mode', async () => {
    const { status, data } = await apiCall('/kb/import', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { id: 'e2e-test-entry-1', source: 'e2e-test', content: 'Test entry', tier: 'USER' },
          { id: 'e2e-test-entry-2', source: 'e2e-test', content: 'Test entry 2', tier: 'USER' },
        ],
        conflictMode: 'skip',
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.imported).toBe('number');
    expect(typeof data.skipped).toBe('number');
    expect(data.message).toBeDefined();
  });

  it('should import KB entries with overwrite conflict mode', async () => {
    const { status, data } = await apiCall('/kb/import', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { id: 'e2e-test-entry-1', source: 'e2e-overwrite', content: 'Overwritten', tier: 'PROJECT' },
        ],
        conflictMode: 'overwrite',
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should import KB entries with merge conflict mode', async () => {
    const { status, data } = await apiCall('/kb/import', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { id: 'e2e-test-entry-1', source: 'e2e-merge', content: 'Merged', tier: 'SHARED' },
        ],
        conflictMode: 'merge',
      }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should reject invalid conflict mode', async () => {
    const { status, data } = await apiCall('/kb/import', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{ id: 'x', content: 'x' }],
        conflictMode: 'invalid',
      }),
    });
    expect(status).toBe(400);
    expect(data.error).toContain('conflictMode');
  });
});

// ============================================================
// 5. KB Promotion
// ============================================================

describe('KB — Promotion Flow (Create, Reject, Cooldown)', () => {
  let promotionId = '';
  const testEntryId = `e2e-promo-entry-${Date.now()}`;

  it('should create a promotion request', async () => {
    const { status, data } = await apiCall('/kb/promotions', {
      method: 'POST',
      body: JSON.stringify({
        entryId: testEntryId,
        fromTier: 'USER',
        toTier: 'SHARED',
        reason: 'E2E test promotion',
      }),
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.promotion).toBeDefined();
    expect(data.promotion.status).toBe('pending');
    promotionId = data.promotion.id;
  });

  it('should list promotions including the new one', async () => {
    const { status, data } = await apiCall('/kb/promotions');
    expect(status).toBe(200);
    expect(data.promotions).toBeInstanceOf(Array);
    const found = data.promotions.find((p: any) => p.id === promotionId);
    expect(found).toBeDefined();
    expect(found.status).toBe('pending');
  });

  it('should reject the promotion (sets cooldown)', async () => {
    const { status, data } = await apiCall(`/kb/promotions/${promotionId}/review`, {
      method: 'POST',
      body: JSON.stringify({ action: 'reject' }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.promotion.status).toBe('rejected');
  });

  it('should return 400 when trying to re-promote during cooldown', async () => {
    const { status, data } = await apiCall('/kb/promotions', {
      method: 'POST',
      body: JSON.stringify({
        entryId: testEntryId,
        fromTier: 'USER',
        toTier: 'SHARED',
        reason: 'Retry after rejection',
      }),
    });
    expect(status).toBe(400);
    expect(data.error).toContain('cooldown');
  });
});

afterAll(async () => {
  await logout();
});
