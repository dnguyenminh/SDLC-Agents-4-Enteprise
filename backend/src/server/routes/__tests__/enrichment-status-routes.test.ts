/**
 * SA4E-157 — Unit/integration tests for enrichment-status-routes.
 * Uses Hono's in-process app.request() against mocked TaskWorker/Repository.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Logger } from 'pino';
import pino from 'pino';
import { createEnrichmentStatusRoutes } from '../enrichment-status-routes.js';
import type { TaskWorker } from '../../modules/memory/task-queue/TaskWorker.js';

const logger: Logger = pino({ level: 'silent' });

/** Build a fake repo with all methods the route touches. */
function makeFakeRepo(overrides: Record<string, unknown> = {}) {
  return {
    getStatsByProject: vi.fn().mockResolvedValue({ pending: 1, processing: 2, completed: 3, failed: 0 }),
    getEarliestActiveTimestamp: vi.fn().mockResolvedValue('2026-01-01T00:00:00.000Z'),
    listProcessing: vi.fn().mockResolvedValue([{ id: 1, source: 'src/a.ts', startedAt: '2026-01-01T00:00:00.000Z' }]),
    listFailed: vi.fn().mockResolvedValue([
      { id: 2, payload: JSON.stringify({ symbolName: 'fooFn' }), error: 'boom' },
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
    repo = makeFakeRepo();
    taskWorker = makeFakeTaskWorker(repo);
    app = createEnrichmentStatusRoutes(makeRegistry(taskWorker), logger);
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

  describe('POST /enrichment/retry-failed', () => {
    it('reconciles orphans and resets failed tasks, returns 200', async () => {
      repo.reconcileOrphans.mockResolvedValue(2);
      repo.retryAllFailed.mockResolvedValue(4);
      const res = await app.request('/enrichment/retry-failed', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeNull();
      expect(body.data.resetCount).toBe(4);
      expect(body.data.purgedCount).toBe(2);
      expect(repo.reconcileOrphans).toHaveBeenCalled();
      expect(repo.retryAllFailed).toHaveBeenCalled();
    });

    it('returns 503 when TaskWorker is missing', async () => {
      const brokenApp = createEnrichmentStatusRoutes(makeRegistry(null), logger);
      const res = await brokenApp.request('/enrichment/retry-failed', { method: 'POST' });
      expect(res.status).toBe(503);
    });
  });

  describe('POST /enrichment/reconcile-orphans', () => {
    it('purges orphan tasks and returns 200', async () => {
      repo.reconcileOrphans.mockResolvedValue(3);
      const res = await app.request('/enrichment/reconcile-orphans', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.purgedCount).toBe(3);
      expect(repo.reconcileOrphans).toHaveBeenCalled();
    });

    it('returns 503 when TaskWorker is missing', async () => {
      const brokenApp = createEnrichmentStatusRoutes(makeRegistry(null), logger);
      const res = await brokenApp.request('/enrichment/reconcile-orphans', { method: 'POST' });
      expect(res.status).toBe(503);
    });
  });
});
