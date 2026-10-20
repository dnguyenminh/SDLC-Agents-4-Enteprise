import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setIndexConcurrencyLimit,
  clearIndexPermissionCache,
} from '../api-index';

vi.mock('../../../admin/db/sessions.js', () => ({
  validateSession: vi.fn(),
}));

vi.mock('../../../admin/admin-db.js', () => ({
  getUserPermissions: vi.fn(),
}));

vi.mock('../../middleware/jwt-auth.js', () => ({
  verifyJwtToken: vi.fn(),
  allowedProjectsFromClaims: vi.fn(),
}));

import { mockValidateSession, mockGrantedCaller, makeApp } from './helpers.js';

describe('api-index routes — SA4E-300 GAP 5 (400/401/429/rejectedReasons)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockValidateSession.mockReset();
    clearIndexPermissionCache(); // permission cache must not leak across tests
    mockGrantedCaller();
  });

  it('rejectedReasons per-file: ../evil.ts + absolute path rejected with EACCES', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'testuser', username: 'u', accessGroupId: 'g' } as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'gap5proj' },
      body: JSON.stringify({
        files: [
          { path: '../evil.ts', content: 'bad' },
          { path: '/abs/path.ts', content: 'bad' },
          { path: 'ok.ts', content: 'hello' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.rejected).toContain('../evil.ts');
    expect(body.rejected).toContain('/abs/path.ts');
    expect(body.rejectedReasons).toHaveLength(2);
    for (const r of body.rejectedReasons) {
      expect(r.code).toBe('EACCES');
      expect(r.message).toBeDefined();
    }
    expect(body.indexed).toBe(1);
  });

  it('writeFilesPhase escape via normalize (a/../../evil.ts) still blocked', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'testuser', username: 'u', accessGroupId: 'g' } as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'gap5proj2' },
      body: JSON.stringify({ files: [{ path: 'a/../../evil.ts', content: 'bad' }] }),
    });
    const body = await res.json() as any;
    expect(body.rejected).toContain('a/../../evil.ts');
    expect(body.rejectedReasons[0].code).toBe('EACCES');
    expect(body.indexed).toBe(0);
  });

  it('429 when exceeding INDEX_CONCURRENCY_LIMIT (4 parallel /api/index/source)', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'u429', username: 'u', accessGroupId: 'g' } as any);
    const { app } = makeApp();
    const payload = (n: number) => ({
      method: 'POST' as const,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'p429' },
      body: JSON.stringify({ files: [{ path: `f${n}.ts`, content: 'x' }] }),
    });
    const results = await Promise.all([
      app.request('/api/index/source', payload(1)),
      app.request('/api/index/source', payload(2)),
      app.request('/api/index/source', payload(3)),
      app.request('/api/index/source', payload(4)),
    ]);
    const statuses = results.map((r) => r.status);
    // At least the 4th concurrent request must be back-pressured
    expect(statuses).toContain(429);
    const idx = statuses.indexOf(429);
    const body = await results[idx].json() as any;
    expect(body.error).toBe('Server busy');
    expect(body.details).toContain('3');
    expect(body.action).toBeDefined();
  }, 15000);

  it('hot-reloads indexLimit.maxConcurrent via setIndexConcurrencyLimit (admin config path)', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'u429b', username: 'u', accessGroupId: 'g' } as any);
    const previous = 3;
    try {
      setIndexConcurrencyLimit(1);
      const { app } = makeApp();
      const payload = (n: number) => ({
        method: 'POST' as const,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'p429b' },
        body: JSON.stringify({ files: [{ path: `f${n}.ts`, content: 'x' }] }),
      });
      const results = await Promise.all([
        app.request('/api/index/source', payload(1)),
        app.request('/api/index/source', payload(2)),
      ]);
      const statuses = results.map((r) => r.status);
      expect(statuses).toContain(429);
      const idx = statuses.indexOf(429);
      const body = await results[idx].json() as any;
      expect(body.error).toBe('Server busy');
      expect(body.details).toContain('1');
    } finally {
      setIndexConcurrencyLimit(previous); // restore default for other tests
    }
  }, 15000);
});
