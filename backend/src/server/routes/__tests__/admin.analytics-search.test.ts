/**
 * Admin route tests — analytics tracking + embedding space (STORY 4)
 * and real KB search (STORY 9).
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

// ===== STORY 4: Analytics Real Query Tracking =====
describe('Admin Routes — Analytics Real Query Tracking (STORY 4)', () => {
  it('POST /api/admin/search records query and returns results', async () => {
    const res = await app.request('/api/admin/search', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query: 'test query for tracking', debug: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('results');
    expect(body).toHaveProperty('debug');
    expect(body.debug.searchTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/admin/analytics shows real query data after search', async () => {
    // Make a few searches first
    await app.request('/api/admin/search', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query: 'analytics test 1' }),
    });
    await app.request('/api/admin/search', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query: 'analytics test 2' }),
    });

    const res = await app.request('/api/admin/analytics', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.summary).toHaveProperty('totalQueries');
    expect(body.summary.totalQueries).toBeGreaterThanOrEqual(2);
    expect(body.summary).toHaveProperty('avgQueryTime');
    expect(body.summary).toHaveProperty('queriesLast24h');
    expect(body.summary.queriesLast24h).toBeGreaterThanOrEqual(2);
    // usageOverTime should have real data
    expect(body.usageOverTime).toHaveLength(14);
    const today = new Date().toISOString().split('T')[0];
    const todayEntry = body.usageOverTime.find((d: any) => d.date === today);
    expect(todayEntry).toBeDefined();
    expect(todayEntry.queries).toBeGreaterThanOrEqual(2);
  });
});

// ===== STORY 4: Embedding Space from Actual Data =====
describe('Admin Routes — Embedding Space Real Data (STORY 4)', () => {
  it('GET /api/admin/analytics returns hasRealEmbeddingData flag', async () => {
    const res = await app.request('/api/admin/analytics', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.summary).toHaveProperty('hasRealEmbeddingData');
    // embeddingSpace should be an array (may be empty if no data)
    expect(Array.isArray(body.embeddingSpace)).toBe(true);
    // If there is real data, each point should have x, y, label
    if (body.embeddingSpace.length > 0) {
      expect(body.embeddingSpace[0]).toHaveProperty('x');
      expect(body.embeddingSpace[0]).toHaveProperty('y');
      expect(body.embeddingSpace[0]).toHaveProperty('label');
    }
  });
});

// ===== STORY 9: Real KB-Based Semantic Search =====
describe('Admin Routes — Real KB Search (STORY 9)', () => {
  it('POST /api/admin/search returns results from real DB or mock fallback', async () => {
    const res = await app.request('/api/admin/search', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query: 'project', debug: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('results');
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    // Each result should have proper structure
    expect(body.results[0]).toHaveProperty('id');
    expect(body.results[0]).toHaveProperty('source');
    expect(body.results[0]).toHaveProperty('content');
    expect(body.results[0]).toHaveProperty('tier');
    expect(body.results[0]).toHaveProperty('score');
  });

  it('POST /api/admin/search with empty query returns empty results', async () => {
    const res = await app.request('/api/admin/search', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query: '' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.results).toHaveLength(0);
  });
});
