import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import * as path from 'path';
import * as os from 'os';
import {
  registerIndexRoutes,
  indexError,
  sanitizePathSegment,
  resolveSafeTargetPath,
  resolveIndexTempBase,
} from '../api-index';

vi.mock('../../../admin/db/sessions.js', () => ({
  validateSession: vi.fn(),
}));

import { validateSession } from '../../../admin/db/sessions.js';

const mockValidateSession = vi.mocked(validateSession);

function makeApp() {
  const app = new Hono();
  const registry = { getModule: vi.fn() } as any;
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any;
  registerIndexRoutes(app, registry, logger);
  return { app, registry, logger };
}

describe('api-index error enrichment', () => {
  it('should register routes without error', () => {
    const app = { post: vi.fn(), get: vi.fn() } as any;
    const registry = { getModule: vi.fn() } as any;
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any;
    expect(() => registerIndexRoutes(app, registry, logger)).not.toThrow();
  });

  it('indexError returns enriched shape for PROJECT_REQUIRED', () => {
    const c = {
      json: vi.fn((body, status) => ({ body, status }))
    } as any;
    const logger = { error: vi.fn() } as any;
    const err = new Error('PROJECT_REQUIRED: missing header');
    const res = indexError(c, err, logger, 'test');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('X-Project-Id required for indexing');
    expect(res.body.details).toContain('PROJECT_REQUIRED');
    expect(res.body.action).toBe('Provide X-Project-Id header');
  });

  it('indexError enriches ENOSPC', () => {
    const c = { json: vi.fn((body, status) => ({ body, status })) } as any;
    const logger = { error: vi.fn() } as any;
    const err = { message: 'no space', code: 'ENOSPC' };
    const res = indexError(c, err, logger, 'test');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Disk full');
    expect(res.body.action).toBe('Free up disk space');
    expect(res.body.details).toBe('no space');
  });

  it('indexError enriches EACCES', () => {
    const c = { json: vi.fn((body, status) => ({ body, status })) } as any;
    const logger = { error: vi.fn() } as any;
    const err = { message: 'permission denied', code: 'EACCES' };
    const res = indexError(c, err, logger, 'test');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Permission denied');
    expect(res.body.action).toBe('Check file permissions');
  });

  it('indexError caps details to 2000 chars', () => {
    const c = { json: vi.fn((body, status) => ({ body, status })) } as any;
    const logger = { error: vi.fn() } as any;
    const longMsg = 'a'.repeat(3000);
    const err = new Error(longMsg);
    const res = indexError(c, err, logger, 'test');
    expect(res.body.details.length).toBeLessThanOrEqual(2000);
  });

  // SA4E-300 GAP 5: default error maps to Retry
  it('indexError default maps to Retry action', () => {
    const c = { json: vi.fn((body, status) => ({ body, status })) } as any;
    const logger = { error: vi.fn() } as any;
    const err = new Error('something unexpected');
    const res = indexError(c, err, logger, 'test');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal error');
    expect(res.body.action).toBe('Retry');
    expect(res.body.details).toBe('something unexpected');
  });
});

describe('api-index routes — SA4E-300 GAP 5 (400/401/429/rejectedReasons)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockValidateSession.mockReset();
  });

  it('401 when Authorization header missing', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/index/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [] }),
    });
    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.error).toBe('Unauthorized');
    expect(body.details).toBeDefined();
    expect(body.action).toBeDefined();
  });

  it('401 when Bearer token invalid/expired (validateSession null)', async () => {
    mockValidateSession.mockResolvedValue(null);
    const { app } = makeApp();
    const res = await app.request('/api/index/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer expired-token' },
      body: JSON.stringify({ files: [] }),
    });
    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.error).toBe('Unauthorized');
    expect(body.details).toContain('Authorization');
  });

  it('400 when files array missing on /api/index/documents', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'u1', username: 'u', accessGroupId: 'g' } as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'p1' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('files array required');
    expect(body.details).toBeDefined();
    expect(body.action).toBeDefined();
  });

  it('400 when files array missing on /api/index/source', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'u1', username: 'u', accessGroupId: 'g' } as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'p1' },
      body: JSON.stringify({ nope: 1 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.details).toBeDefined();
    expect(body.action).toBeDefined();
  });

  it('400 with details on sync-pega when projectId missing', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'u1', username: 'u', accessGroupId: 'g' } as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/sync-pega-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('projectId is required');
    expect(body.details).toBeDefined();
    expect(body.action).toBeDefined();
  });

  it('503 with details on sync-pega when memory module not ready', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'u1', username: 'u', accessGroupId: 'g' } as any);
    const { app, registry } = makeApp();
    (registry.getModule as any).mockReturnValue({ status: 'starting' });
    const res = await app.request('/api/index/sync-pega-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good' },
      body: JSON.stringify({ projectId: 'proj-x' }),
    });
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.error).toBe('Memory module not ready');
    expect(body.details).toBeDefined();
    expect(body.action).toBeDefined();
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
});

describe('SA4E-300 GAP 1 helpers', () => {
  it('sanitizePathSegment strips unsafe chars and falls back', () => {
    expect(sanitizePathSegment('../../etc', 'local-dev')).toBe('....etc');
    expect(sanitizePathSegment('', 'local-dev')).toBe('local-dev');
    expect(sanitizePathSegment('..', 'default')).toBe('default');
    expect(sanitizePathSegment('user@example.com', 'local-dev')).toBe('userexample.com');
    expect(sanitizePathSegment('proj-123_abc.def', 'default')).toBe('proj-123_abc.def');
  });

  it('resolveIndexTempBase uses cross-platform base (not hardcoded Windows)', () => {
    const base = resolveIndexTempBase('u1', 'p1', 'batch-docs');
    expect(base).not.toContain('C:\\projects\\kiro\\Temp');
    expect(base.endsWith(path.join('u1', 'p1', 'batch-docs'))).toBe(true);
  });

  it('resolveSafeTargetPath blocks traversal, absolute, backslash, encoded, drive', () => {
    const tempBase = path.join(os.tmpdir(), 'CodeIntel', 'u', 'p', 'batch-docs');
    expect(resolveSafeTargetPath(tempBase, '../evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, '/abs/evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, '..\\evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, 'a/../../evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, '%2e%2e/evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, 'C:\\evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, 'C:/evil.ts')).toBeNull();
    const ok = resolveSafeTargetPath(tempBase, 'docs/ok.md');
    expect(ok).not.toBeNull();
    expect(path.relative(tempBase, ok as string).startsWith('..')).toBe(false);
  });
});
