/**
 * SA4E-157 — enrichment-status-routes tests.
 * SA4E-338 S1 — hardened retry/reconcile/failures (rev B scoping + D-SEC-01/02).
 * This file: GET /enrichment/status.
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
      const brokenApp = createEnrichmentStatusRoutes(makeRegistry(null), esLogger);
      const res = await brokenApp.request('/enrichment/status', { method: 'GET' });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe('Enrichment service unavailable');
    });

    it('returns 500 when building the response throws', async () => {
      const badRepo = makeFakeRepo({ getEarliestActiveTimestamp: vi.fn().mockRejectedValue(new Error('db down')) });
      const badApp = createEnrichmentStatusRoutes(makeRegistry(makeFakeTaskWorker(badRepo)), esLogger);
      const res = await badApp.request('/enrichment/status', { method: 'GET' });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to retrieve enrichment status');
    });
  });
});
