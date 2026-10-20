/**
 * SA4E-157 — enrichment-status-routes tests.
 * SA4E-338 S1 — hardened retry endpoint (rev B scoping, audit, rate limit).
 * This file: POST /enrichment/retry-failed.
 * Uses Hono's in-process app.request() against mocked TaskWorker/Repository.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import {
  esLogger,
  makeJwt,
  adminJwt,
  authHeaders,
  authHeadersNoScope,
  makeFakeRepo,
  makeFakeTaskWorker,
  makeRegistry,
} from './helpers.js';

describe('createEnrichmentStatusRoutes', () => {
  let repo: any;
  let taskWorker: TaskWorker;
  let app: ReturnType<typeof createEnrichmentStatusRoutes>;

  beforeEach(() => {
    process.env.KB_TOKEN_SECRET = 'test-secret';
    mockGetUserPermissions.mockClear();
    mockGetUserPermissions.mockResolvedValue([{ permissionId: 'CONFIG_EDIT', roleData: {} }]);
    mockRecordAudit.mockClear();
    mockRecordAudit.mockResolvedValue(undefined);
    repo = makeFakeRepo();
    taskWorker = makeFakeTaskWorker(repo);
    app = createEnrichmentStatusRoutes(makeRegistry(taskWorker), esLogger);
  });

  afterEach(() => {
    delete (process.env as any).KB_TOKEN_SECRET;
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
      const brokenApp = createEnrichmentStatusRoutes(makeRegistry(null), esLogger);
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
});
