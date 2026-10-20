/**
 * SA4E-157 — enrichment-status-routes tests.
 * SA4E-338 S1 — hardened reconcile endpoint (rev B scoping + D-SEC-01).
 * This file: POST /enrichment/reconcile-orphans.
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
  adminJwt,
  authHeaders,
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
      const brokenApp = createEnrichmentStatusRoutes(makeRegistry(null), esLogger);
      const res = await brokenApp.request('/enrichment/reconcile-orphans', {
        method: 'POST',
        headers: authHeaders(adminJwt()),
      });
      expect(res.status).toBe(503);
    });
  });
});
