/**
 * E2E API Tests — Admin Portal: unauthorized access (no token → 401).
 * (Split from admin-api.e2e.test.ts — BR-18 ≤200 lines/file.)
 *
 * Run: npm run test:e2e-api
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { API, ensureServerUp } from './admin-api.fixtures.js';

beforeAll(async () => {
  await ensureServerUp();
});

// ============================================================
// 10. Unauthorized Access
// ============================================================

describe('Unauthorized — All Endpoints Return 401 Without Token', () => {
  const endpoints = [
    { method: 'GET', path: '/stats' },
    { method: 'GET', path: '/users' },
    { method: 'GET', path: '/profile' },
    { method: 'GET', path: '/rbac/groups' },
    { method: 'GET', path: '/mcp/servers' },
    { method: 'GET', path: '/config' },
    { method: 'GET', path: '/audit' },
    { method: 'GET', path: '/kb/entries' },
    { method: 'GET', path: '/kb/graph' },
    { method: 'GET', path: '/analytics' },
    { method: 'POST', path: '/search' },
    { method: 'GET', path: '/kb/export' },
  ];

  for (const { method, path } of endpoints) {
    it(`${method} ${path} should return 401 without token`, async () => {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify({ query: 'test' }) } : {}),
      });
      expect(res.status).toBe(401);
    });
  }
});
