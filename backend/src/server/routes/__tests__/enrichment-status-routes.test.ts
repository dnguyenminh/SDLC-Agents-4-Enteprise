/**
 * SA4E-157 — Unit/integration tests for enrichment-status-routes.
 * SA4E-338 S1 — hardened retry/reconcile/failures: X-Project-Id scope (rev B —
 * JWT supplies identity, header supplies scope), admin permission gate (D-SEC-01),
 * rate limiting, bounded/scoped retry + audit (D-SEC-02).
 * Uses Hono's in-process app.request() against mocked TaskWorker/Repository.
 * Traces: TC-SEC-01a…e, STC UT (S1) + IT-09/11/12 specs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import type { Logger } from 'pino';
import pino from 'pino';

const { mockGetUserPermissions, mockRecordAudit } = vi.hoisted(() => ({
  mockGetUserPermissions: vi.fn().mockResolvedValue([{ permissionId: 'CONFIG_EDIT', roleData: {} }]),
  mockRecordAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../admin/admin-db.js', () => ({
  getUserPermissions: mockGetUserPermissions,
  recordAudit: mockRecordAudit,
  validateSession: vi.fn().mockResolvedValue(null),
  createSession: vi.fn(),
  invalidateSession: vi.fn(),
  refreshSession: vi.fn(),
}));

import { createEnrichmentStatusRoutes } from '../enrichment-status-routes.js';
import type { TaskWorker } from '../../../modules/memory/task-queue/TaskWorker.js';

const logger: Logger = pino({ level: 'silent' });
const TEST_SECRET = 'test-secret';

/** Mint an HS256 JWT matching jwt-auth verifyHs256 (pattern from jwt-auth.test.ts). */
function makeJwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload })).toString('base64url');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const sig = createHmac('sha256', TEST_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

/** Admin JWT — identity only (SA4E-338 rev B: scope comes from X-Project-Id header). */
function adminJwt(): string {
  return makeJwt({ sub: 'admin-1', username: 'admin' });
}

/** Auth headers with a project scope (rev B default) plus any extras. */
function authHeaders(jwt: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${jwt}`, 'X-Project-Id': 'proj-A', ...extra };
}

/** Auth headers carrying only the Bearer token — no project scope header. */
function authHeadersNoScope(jwt: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${jwt}`, ...extra };
}

/** Build a fake repo with all methods the route touches. */
function makeFakeRepo(overrides: Record<string, unknown> = {}) {
  return {
    getStatsByProject: vi.fn().mockResolvedValue({ pending: 1, processing: 2, completed: 3, failed: 0 }),
    getEarliestActiveTimestamp: vi.fn().mockResolvedValue('2026-01-01T00:00:00.000Z'),
    listProcessing: vi.fn().mockResolvedValue([{ id: 1, source: 'src/a.ts', startedAt: '2026-01-01T00:00:00.000Z' }]),
    listFailed: vi.fn().mockResolvedValue([
      { id: 2, payload: JSON.stringify({ symbolName: 'fooFn' }), error: 'boom' },
    ]),
    listFailedDetailed: vi.fn().mockResolvedValue([
      { id: 2, source: 'fooFn', error: 'boom', retryCount: 3, completedAt: '2026-01-02T00:00:00.000Z' },
    ]),
    reconcileOrphans: vi.fn().mockResolvedValue(0),
    retryAllFailed: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

/** Build a fake TaskWorker wrapping the given repo. */
function makeFakeTaskWorker(repo: any, statsOverride?: any): TaskWorker {
  return {
    getRepository: () => repo,
    getProgress: () => ({ file: 'src/a.ts' }),
    getConcurrency: () => 8,
    getStats: vi.fn().mockResolvedValue(
      statsOverride ?? { pending: 1, processing: 2, completed: 3, failed: 0, isRunning: true, lastPollAt: null },
    ),
  } as unknown as TaskWorker;
}

function makeRegistry(taskWorker: any): any {
  return { getModule: (name: string) => (name === 'memory' ? { taskWorker } : null) };
}

describe('createEnrichmentStatusRoutes', () => {
  let repo: any;
  let taskWorker: TaskWorker;
  let app: ReturnType<typeof createEnrichmentStatusRoutes>;

  beforeEach(() => {
    process.env.KB_TOKEN_SECRET = TEST_SECRET;
    mockGetUserPermissions.mockResolvedValue([{ permissionId: 'CONFIG_EDIT', roleData: {} }]);
    mockGetUserPermissions.mockClear();
    mockGetUserPermissions.mockResolvedValue([{ permissionId: 'CONFIG_EDIT', roleData: {} }]);
    mockRecordAudit.mockClear();
    mockRecordAudit.mockResolvedValue(undefined);
    repo = makeFakeRepo();
    taskWorker = makeFakeTaskWorker(repo);
    app = createEnrichmentStatusRoutes(makeRegistry(taskWorker), logger);
  });

  afterEach(() => {
    delete (process.env as any).KB_TOKEN_SECRET;
  });

  describe('GET /enrichment/status', () => {
    it('returns 200 with a fully derived status payload (no project scope)', async () => {
      const res = await app.request('/enrichment/status', { method: 'GET' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.state).toBe('running');
      expect(body.totalRules).toBe(6); // 1+2+3+0
      expect(body.completedRules).toBe(3);
      expect(body.percent).toBe(50); // floor(3/6*100)
      expect(body.startedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(body.activeTasks).toEqual([{ source: 'src/a.ts' }]);
      expect(body.recentFailures).toEqual([
        { taskId: 2, symbolName: 'fooFn', error: 'boom' },
      ]);
      expect(body.maxConcurrency).toBe(8);
      expect(body.activeConcurrency).toBe(2); // stats.processing
      // No X-Project-Id → uses taskWorker.getStats(), not repo.getStatsByProject
      expect(repo.getStatsByProject).not.toHaveBeenCalled();
      expect(taskWorker.getStats).toHaveBeenCalled();
    });

    it('scopes stats to project when X-Project-Id header is present', async () => {
      const res = await app.request('/enrichment/status', {
        method: 'GET',
        headers: { 'X-Project-Id': 'proj-7' },
      });
      expect(res.status).toBe(200);
      expect(repo.getStatsByProject).toHaveBeenCalledWith('proj-7');
      expect(taskWorker.getStats).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body.projectId).toBe('proj-7');
    });

    it('returns 503 when TaskWorker is not initialised', async () => {
      const brokenApp = createEnrichmentStatusRoutes(makeRegistry(null), logger);
      const res = await brokenApp.request('/enrichment/status', { method: 'GET' });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe('Enrichment service unavailable');
    });

    it('returns 500 when building the response throws', async () => {
      const badRepo = makeFakeRepo({ getEarliestActiveTimestamp: vi.fn().mockRejectedValue(new Error('db down')) });
      const badApp = createEnrichmentStatusRoutes(makeRegistry(makeFakeTaskWorker(badRepo)), logger);
      const res = await badApp.request('/enrichment/status', { method: 'GET' });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to retrieve enrichment status');
    });
  });

  describe('GET /enrichment/failures — S1 hardening', () => {
    it('scopes to the X-Project-Id header (rev B)', async () => {
      const res = await app.request('/enrichment/failures', {
        method: 'GET',
        headers: authHeaders(adminJwt(), { 'X-Project-Id': 'proj-B' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.projectId).toBe('proj-B');
      expect(repo.listFailedDetailed).toHaveBeenCalledWith(200, 'proj-B');
    });

    it('clamps limit to [1,1000] with the default of 200', async () => {
      const res = await app.request('/enrichment/failures?limit=99999', {
        method: 'GET',
        headers: authHeaders(adminJwt()),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.limit).toBe(1000);
      expect(repo.listFailedDetailed).toHaveBeenCalledWith(1000, 'proj-A');
    });

    it('returns 401 without a JWT and never reads failures (TC-SEC-01a)', async () => {
      const res = await app.request('/enrichment/failures', { method: 'GET' });
      expect(res.status).toBe(401);
      expect(repo.listFailedDetailed).not.toHaveBeenCalled();
    });

    it('returns 403 for a non-admin JWT (TC-SEC-01a)', async () => {
      mockGetUserPermissions.mockResolvedValue([]);
      const res = await app.request('/enrichment/failures', {
        method: 'GET',
        headers: authHeaders(adminJwt()),
      });
      expect(res.status).toBe(403);
      expect(repo.listFailedDetailed).not.toHaveBeenCalled();
    });

    it('returns 403 when no project scope is supplied (rev B)', async () => {
      const res = await app.request('/enrichment/failures', {
        method: 'GET',
        headers: authHeadersNoScope(makeJwt({ sub: 'admin-1' })),
      });
      expect(res.status).toBe(403);
      expect(repo.listFailedDetailed).not.toHaveBeenCalled();
    });

    it('falls back to a JWT pid claim when the header is absent (rev B back-compat)', async () => {
      const res = await app.request('/enrichment/failures', {
        method: 'GET',
        headers: authHeadersNoScope(makeJwt({ sub: 'admin-1', username: 'admin', pid: 'proj-claim' })),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.projectId).toBe('proj-claim');
      expect(repo.listFailedDetailed).toHaveBeenCalledWith(200, 'proj-claim');
    });

    it('returns 503 when TaskWorker is missing (authorized caller)', async () => {
      const brokenApp = createEnrichmentStatusRoutes(makeRegistry(null), logger);
      const res = await brokenApp.request('/enrichment/failures', {
        method: 'GET',
        headers: authHeaders(adminJwt()),
      });
      expect(res.status).toBe(503);
    });
  });

  describe('POST /enrichment/retry-failed — S1 hardening', () => {
    it('resets with X-Project-Id scope, 500 limit + terminal exclusion info, writes audit', async () => {
      repo.reconcileOrphans.mockResolvedValue(2);
      repo.retryAllFailed.mockResolvedValue(4);
      const res = await app.request('/enrichment/retry-failed', {
        method: 'POST',
        headers: authHeaders(adminJwt()),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data).toMatchObject({ resetCount: 4, purgedCount: 2, limit: 500, excluded: 'terminal' });
      expect(repo.retryAllFailed).toHaveBeenCalledWith({ projectScope: 'proj-A', limit: 500 });
      expect(mockRecordAudit).toHaveBeenCalledWith(
        'admin-1', 'admin', 'enrichment_retry', 'enrichment', 'proj-A',
        expect.stringContaining('"resetCount":4'),
      );
    });

    it('scopes to the X-Project-Id header the client sends (rev B)', async () => {
      const res = await app.request('/enrichment/retry-failed', {
        method: 'POST',
        headers: authHeaders(adminJwt(), { 'X-Project-Id': 'proj-B' }),
      });
      expect(res.status).toBe(200);
      expect(repo.retryAllFailed).toHaveBeenCalledWith({ projectScope: 'proj-B', limit: 500 });
    });

    it('returns 401 without a JWT and mutates nothing (TC-SEC-01a)', async () => {
      const res = await app.request('/enrichment/retry-failed', { method: 'POST' });
      expect(res.status).toBe(401);
      expect(repo.retryAllFailed).not.toHaveBeenCalled();
      expect(repo.reconcileOrphans).not.toHaveBeenCalled();
    });

    it('returns 403 for a non-admin JWT and mutates nothing (TC-SEC-01a)', async () => {
      mockGetUserPermissions.mockResolvedValue([{ permissionId: 'KB_READ', roleData: {} }]);
      const res = await app.request('/enrichment/retry-failed', {
        method: 'POST',
        headers: authHeaders(adminJwt()),
      });
      expect(res.status).toBe(403);
      expect(repo.retryAllFailed).not.toHaveBeenCalled();
    });

    it('returns 403 when no project scope is supplied (rev B) and mutates nothing', async () => {
      const res = await app.request('/enrichment/retry-failed', {
        method: 'POST',
        headers: authHeadersNoScope(makeJwt({ sub: 'admin-1' })),
      });
      expect(res.status).toBe(403);
      expect(repo.retryAllFailed).not.toHaveBeenCalled();
    });

    it('returns 503 when TaskWorker is missing (authorized caller)', async () => {
      const brokenApp = createEnrichmentStatusRoutes(makeRegistry(null), logger);
      const res = await brokenApp.request('/enrichment/retry-failed', {
        method: 'POST',
        headers: authHeaders(adminJwt()),
      });
      expect(res.status).toBe(503);
    });

    it('still succeeds when the audit write fails (audit never blocks retry)', async () => {
      mockRecordAudit.mockRejectedValueOnce(new Error('audit db down'));
      repo.retryAllFailed.mockResolvedValue(1);
      const res = await app.request('/enrichment/retry-failed', {
        method: 'POST',
        headers: authHeaders(adminJwt()),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.resetCount).toBe(1);
    });

    it('rate-limits a burst — second rapid call is 429 (TC-SEC-01d)', async () => {
      const req = {
        method: 'POST' as const,
        headers: authHeaders(adminJwt(), { 'x-rate-limit-rpm': '1' }),
      };
      await app.request('/enrichment/retry-failed', req);
      const res2 = await app.request('/enrichment/retry-failed', req);
      expect(res2.status).toBe(429);
    });
  });

  describe('POST /enrichment/reconcile-orphans — S1 hardening', () => {
    it('purges orphan tasks for an admin JWT', async () => {
      repo.reconcileOrphans.mockResolvedValue(3);
      const res = await app.request('/enrichment/reconcile-orphans', {
        method: 'POST',
        headers: authHeaders(adminJwt()),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.purgedCount).toBe(3);
      expect(repo.reconcileOrphans).toHaveBeenCalled();
    });

    it('returns 401 without a JWT and purges nothing', async () => {
      const res = await app.request('/enrichment/reconcile-orphans', { method: 'POST' });
      expect(res.status).toBe(401);
      expect(repo.reconcileOrphans).not.toHaveBeenCalled();
    });

    it('returns 403 for a non-admin JWT', async () => {
      mockGetUserPermissions.mockResolvedValue([]);
      const res = await app.request('/enrichment/reconcile-orphans', {
        method: 'POST',
        headers: authHeaders(adminJwt()),
      });
      expect(res.status).toBe(403);
      expect(repo.reconcileOrphans).not.toHaveBeenCalled();
    });

    it('returns 503 when TaskWorker is missing (authorized caller)', async () => {
      const brokenApp = createEnrichmentStatusRoutes(makeRegistry(null), logger);
      const res = await brokenApp.request('/enrichment/reconcile-orphans', {
        method: 'POST',
        headers: authHeaders(adminJwt()),
      });
      expect(res.status).toBe(503);
    });
  });
});
