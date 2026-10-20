/**
 * SA4E-157 — enrichment-status-routes tests.
 * SA4E-338 S1 — hardened failures endpoint (rev B scoping + D-SEC-01).
 * This file: GET /enrichment/failures.
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
      const brokenApp = createEnrichmentStatusRoutes(makeRegistry(null), esLogger);
      const res = await brokenApp.request('/enrichment/failures', {
        method: 'GET',
        headers: authHeaders(adminJwt()),
      });
      expect(res.status).toBe(503);
    });
  });
});
