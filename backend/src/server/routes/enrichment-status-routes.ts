/**
 * SA4E-157 — Enrichment Status Route.
 * GET /api/v1/enrichment/status — returns current LLM enrichment progress.
 * JWT auth required (backend is remote), no admin permission check (read-only data).
 *
 * SA4E-338 S1+S2: POST /enrichment/retry-failed hardened:
 *  - admin-only (require ADMIN claim from JWT pid scope)
 *  - rate-limit 6 burst → 429
 *  - exclude terminal errors (budget_error:/llm_auth:)
 *  - limit 500 re-queued per call
 *  - project scope from JWT pid (not X-Project-Id header)
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { jwtAuth, jwtAuthStrict } from '../middleware/jwt-auth.js';
import { deriveEnrichmentState } from '../../shared/schemas/EnrichmentStatusSchema.js';
import type { EnrichmentStatusResponse } from '../../shared/schemas/EnrichmentStatusSchema.js';
import type { TaskWorker } from '../../modules/memory/task-queue/TaskWorker.js';
import type { PendingTaskRepository } from '../../modules/memory/task-queue/PendingTaskRepository.js';

/** In-memory burst limiter: IP → timestamps of retry calls. */
const retryTimestamps = new Map<string, number[]>();
const RETRY_BURST_LIMIT = 6;
const RETRY_BURST_WINDOW_MS = 60_000;

function checkRetryBurstLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = retryTimestamps.get(ip) ?? [];
  const windowStart = now - RETRY_BURST_WINDOW_MS;
  const recent = timestamps.filter((t) => t > windowStart);
  if (recent.length >= RETRY_BURST_LIMIT) {
    retryTimestamps.set(ip, recent);
    return false;
  }
  recent.push(now);
  retryTimestamps.set(ip, recent);
  return true;
}

/**
 * Create enrichment status route group.
 * @param registry Module registry for accessing TaskWorker
 * @param logger Pino logger instance
 * @returns Hono app with enrichment status routes
 */
export function createEnrichmentStatusRoutes(registry: ModuleRegistry, logger: Logger): Hono {
  const app = new Hono();

  // SA4E: Backend is remote from the extension — every API call must carry a JWT.
  // jwtAuth binds project context from the token (anonymous only when
  // CODE_INTEL_REQUIRE_AUTH is not set). Status data is read-only, no admin check.
  app.get('/enrichment/status', jwtAuth, async (c) => {
    try {
      const taskWorker = getTaskWorker(registry);
      if (!taskWorker) {
        return c.json({ error: 'Enrichment service unavailable', details: 'TaskWorker not initialized' }, 503);
      }

      // S2: Project scope from JWT pid (projectContext), never from X-Project-Id header.
      const projectContext = c.get('projectContext') as { projectId: string } | undefined;
      const projectId = projectContext?.projectId ?? '';

      const response = await buildStatusResponse(taskWorker, projectId || null);
      return c.json(response, 200);
    } catch (err: any) {
      logger.error({ err }, '[EnrichmentStatus] Failed to retrieve status');
      return c.json({ error: 'Failed to retrieve enrichment status', details: err.message }, 500);
    }
  });

  /**
   * GET /api/v1/enrichment/failures?limit=N — full list of FAILED enrichment tasks,
   * scoped to the request's project (from JWT pid). Unlike the status endpoint's recentFailures
   * (capped at 10), this returns every failure (bounded by limit, default 200, max 1000).
   */
  app.get('/enrichment/failures', jwtAuth, async (c) => {
    try {
      const taskWorker = getTaskWorker(registry);
      if (!taskWorker) {
        return c.json({ error: 'Enrichment service unavailable', details: 'TaskWorker not initialized' }, 503);
      }

      // S2: Project scope from JWT pid.
      const projectContext = c.get('projectContext') as { projectId: string } | undefined;
      const projectId = projectContext?.projectId ?? '';

      const rawLimit = Number(c.req.query('limit'));
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 1000) : 200;
      const repo = taskWorker.getRepository();
      const failures = await repo.listFailedDetailed(limit, projectId || undefined);
      return c.json({ projectId: projectId || null, count: failures.length, limit, failures }, 200);
    } catch (err: any) {
      logger.error({ err }, '[EnrichmentStatus] Failed to list failures');
      return c.json({ error: 'Failed to list enrichment failures', details: err.message }, 500);
    }
  });

  /**
   * POST /api/v1/enrichment/retry-failed — reconcile orphans first, then reset failed tasks to pending.
   * S1 (SEC-338-01 FIX): admin-only, rate-limit 6 burst → 429, exclude terminal errors, limit 500.
   * S2: project scope from JWT pid, X-Project-Id header ignored.
   */
  app.post('/enrichment/retry-failed', jwtAuthStrict, async (c) => {
    try {
      // S1: Rate-limit: 6 burst per IP per minute → 429.
      const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || '127.0.0.1';
      if (!checkRetryBurstLimit(ip)) {
        return c.json({ error: 'Too many requests', retryAfter: 60 }, { status: 429, headers: { 'Retry-After': '60' } });
      }

      // S1: Admin-only — verify JWT has admin claim.
      const payload = c.get('jwtPayload') as Record<string, any> | undefined;
      const isAdmin = payload?.role === 'ADMIN' || payload?.permissions?.includes('CONFIG_EDIT') || false;
      if (!isAdmin) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Admin permission required' } }, 403);
      }

      // S2: Project scope from JWT pid (projectContext), never from X-Project-Id header.
      const projectContext = c.get('projectContext') as { projectId: string } | undefined;
      const projectId = projectContext?.projectId ?? '';

      const taskWorker = getTaskWorker(registry);
      if (!taskWorker) {
        return c.json({ error: 'Enrichment service unavailable', details: 'TaskWorker not initialized' }, 503);
      }
      const repo = taskWorker.getRepository();

      // Auto-purge orphan tasks before retry (entries deleted but tasks remain)
      const purgedCount = await repo.reconcileOrphans();
      if (purgedCount > 0) {
        logger.info({ purgedCount }, '[EnrichmentStatus] Auto-purged orphan tasks before retry');
      }

      // S1: Exclude terminal errors (budget_error:/llm_auth:), limit 500, scope to project.
      const resetCount = await repo.retryAllFailed({
        excludeTerminalErrors: true,
        limit: 500,
        projectId: projectId || undefined,
      });
      logger.info({ resetCount, purgedCount }, '[EnrichmentStatus] Retry failed tasks');
      return c.json({ data: { resetCount, purgedCount, message: `${purgedCount} orphans purged, ${resetCount} failed tasks reset to pending` }, error: null });
    } catch (err: any) {
      logger.error({ err }, '[EnrichmentStatus] Retry failed tasks error');
      return c.json({ error: 'Failed to retry tasks', details: err.message }, 500);
    }
  });

  /** POST /api/v1/enrichment/reconcile-orphans — purge orphan tasks whose symbols/entries were deleted. */
  app.post('/enrichment/reconcile-orphans', jwtAuth, async (c) => {
    try {
      const taskWorker = getTaskWorker(registry);
      if (!taskWorker) {
        return c.json({ error: 'Enrichment service unavailable', details: 'TaskWorker not initialized' }, 503);
      }
      const repo = taskWorker.getRepository();
      const purgedCount = await repo.reconcileOrphans();
      logger.info({ purgedCount }, '[EnrichmentStatus] Reconciled orphan tasks');
      return c.json({ data: { purgedCount, message: `${purgedCount} orphan tasks deleted` }, error: null });
    } catch (err: any) {
      logger.error({ err }, '[EnrichmentStatus] Reconcile orphans error');
      return c.json({ error: 'Failed to reconcile orphans', details: err.message }, 500);
    }
  });

  return app;
}

/** Extract TaskWorker from registry via memory module (same pattern as admin routes). */
function getTaskWorker(registry: ModuleRegistry): TaskWorker | null {
  const memory = registry.getModule('memory') as any;
  return memory?.taskWorker ?? null;
}

/** Build the full enrichment status response from TaskWorker data, scoped to project. */
async function buildStatusResponse(taskWorker: TaskWorker, projectId: string | null): Promise<EnrichmentStatusResponse & { activeTasks: Array<{ source: string }>; recentFailures: Array<{ symbolName: string; error: string; taskId: number }> }> {
  const repo = taskWorker.getRepository();
  const progress = await taskWorker.getProgress();

  // Project-scoped stats: JOIN pending_tasks with knowledge_entries to filter by project_id
  const rawStats = projectId
    ? await repo.getStatsByProject(projectId)
    : await taskWorker.getStats();
  const startedAt = await repo.getEarliestActiveTimestamp();

  // PostgreSQL COUNT returns bigint as string — ensure numbers
  const stats = {
    pending: Number(rawStats.pending) || 0,
    processing: Number(rawStats.processing) || 0,
    completed: Number(rawStats.completed) || 0,
    failed: Number(rawStats.failed) || 0,
    isRunning: (rawStats as any).isRunning ?? (Number(rawStats.processing) > 0 || Number(rawStats.pending) > 0),
    lastPollAt: (rawStats as any).lastPollAt ?? null,
  };

  const state = deriveEnrichmentState(stats);
  const total = stats.pending + stats.processing + stats.completed + stats.failed;
  // BR-02: percent = completed / total * 100 (floor to avoid showing 100% when not truly done)
  const percent = total > 0 ? Math.floor((stats.completed / total) * 100) : 0;
  const estimatedCompletion = computeEstimatedCompletion(stats.completed, total, startedAt);

  return {
    state,
    projectId: projectId || null,
    totalRules: total,
    completedRules: stats.completed,
    failedRules: stats.failed,
    pendingRules: stats.pending,
    processingRules: stats.processing,
    percent,
    isRunning: stats.isRunning,
    startedAt,
    estimatedCompletion,
    currentFile: progress?.file ?? null,
    lastPollAt: stats.lastPollAt,
    maxConcurrency: taskWorker.getConcurrency(),
    activeConcurrency: stats.processing,
    activeTasks: await getActiveTasks(repo, projectId ?? undefined),
    recentFailures: await getRecentFailures(repo),
  };
}

/**
 * Compute estimated completion time (BR-08).
 * Only meaningful when completedRules >= 10 (avoids wild extrapolation).
 */
function computeEstimatedCompletion(
  completed: number, total: number, startedAt: string | null,
): string | null {
  if (!startedAt || completed < 10 || total === 0) return null;
  const start = new Date(startedAt).getTime();
  if (isNaN(start)) return null;
  const now = Date.now();
  const elapsed = now - start;
  if (elapsed <= 0) return null;
  const msPerTask = elapsed / completed;
  const remaining = total - completed;
  const etaMs = now + msPerTask * remaining;
  if (!isFinite(etaMs)) return null;
  return new Date(etaMs).toISOString();
}

/** Get currently processing tasks for tooltip display, scoped by project. */
async function getActiveTasks(
  repo: InstanceType<typeof import('../../modules/memory/task-queue/PendingTaskRepository.js').PendingTaskRepository>,
  projectId?: string,
): Promise<Array<{ source: string }>> {
  try {
    // Show enough rows to cover higher concurrency configs (was 5).
    const tasks = await repo.listProcessing(64, projectId);
    return tasks.map((t) => ({ source: t.source }));
  } catch {
    return [];
  }
}

/** Get recent failed tasks with error messages for dashboard display. */
async function getRecentFailures(
  repo: InstanceType<typeof import('../../modules/memory/task-queue/PendingTaskRepository.js').PendingTaskRepository>,
): Promise<Array<{ symbolName: string; error: string; taskId: number }>> {
  try {
    const tasks = await repo.listFailed(10);
    return tasks.map((t) => {
      const payload = typeof t.payload === 'string' ? JSON.parse(t.payload) : t.payload;
      return {
        taskId: t.id,
        symbolName: payload?.symbolName || payload?.filePath || `entry-${t.entry_id}`,
        error: (t as any).error || 'Unknown error',
      };
    });
  } catch {
    return [];
  }
}
