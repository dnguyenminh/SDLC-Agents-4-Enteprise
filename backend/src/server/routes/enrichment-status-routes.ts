/**
 * SA4E-157 — Enrichment Status Route.
 * GET /api/v1/enrichment/status — returns current LLM enrichment progress.
 * JWT auth required (backend is remote), no admin permission check (read-only data).
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { rateLimiter } from '../middleware/rate-limiter.js';
import { recordAudit } from '../../admin/admin-db.js';
import { resolveJwtIdentity, requireEnrichmentAdmin, identityDenied } from './enrichment-auth-guard.js';
import { deriveEnrichmentState } from '../../shared/schemas/EnrichmentStatusSchema.js';
import type { EnrichmentStatusResponse } from '../../shared/schemas/EnrichmentStatusSchema.js';
import type { TaskWorker } from '../../modules/memory/task-queue/TaskWorker.js';

/** SA4E-338 S1 (D-SEC-02): max FAILED tasks re-queued per retry call. */
const RETRY_FAILED_LIMIT = 500;

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

      // Filter by project_id from request context (X-Project-Id header or JWT)
      const projectId = c.req.header('X-Project-Id') || '';

      const response = await buildStatusResponse(taskWorker, projectId || null);
      return c.json(response, 200);
    } catch (err: any) {
      logger.error({ err }, '[EnrichmentStatus] Failed to retrieve status');
      return c.json({ error: 'Failed to retrieve enrichment status', details: err.message }, 500);
    }
  });

  /**
   * GET /api/v1/enrichment/failures?limit=N — full list of FAILED enrichment tasks,
   * scoped to the caller's JWT project (`pid`). Unlike the status endpoint's
   * recentFailures (capped at 10), this returns every failure (bounded by `limit`,
   * default 200, max 1000) so the user can see exactly which rules/symbols failed
   * and why. Each item carries the resolved source name, the stored error string,
   * retry count, and completion timestamp.
   * SA4E-338 S1 (D-SEC-01/03): rate-limited + admin-gated; the `X-Project-Id`
   * header is ignored — scope comes from the verified JWT only.
   */
  app.get('/enrichment/failures', rateLimiter, jwtAuth, async (c) => {
    try {
      const identity = await resolveJwtIdentity(c);
      if (!identity.ok) return identityDenied(c, identity);
      const denied = await requireEnrichmentAdmin(c, identity.identity.userId, logger);
      if (denied) return denied;
      const taskWorker = getTaskWorker(registry);
      if (!taskWorker) {
        return c.json({ error: 'Enrichment service unavailable', details: 'TaskWorker not initialized' }, 503);
      }
      // Clamp limit to [1, 1000] — guards against unbounded payloads and bad input.
      const rawLimit = Number(c.req.query('limit'));
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 1000) : 200;
      const projectId = identity.identity.projectId;
      const failures = await taskWorker.getRepository().listFailedDetailed(limit, projectId);
      return c.json({ projectId, count: failures.length, limit, failures }, 200);
    } catch (err: any) {
      logger.error({ err }, '[EnrichmentStatus] Failed to list failures');
      return c.json({ error: 'Failed to list enrichment failures', details: err.message }, 500);
    }
  });

  /**
   * POST /api/v1/enrichment/retry-failed — reconcile orphans first, then reset FAILED
   * tasks to pending. SA4E-338 S1 (D-SEC-01/02/03): admin-gated + rate-limited +
   * JWT-pid-scoped; `retryAllFailed` excludes terminal `budget_error:`/`llm_auth:`
   * tasks server-side and is bounded to 500 rows per call (OI-05). Each mutation
   * writes an `enrichment_retry` audit entry.
   */
  app.post('/enrichment/retry-failed', rateLimiter, jwtAuth, async (c) => {
    try {
      const identity = await resolveJwtIdentity(c);
      if (!identity.ok) return identityDenied(c, identity);
      const denied = await requireEnrichmentAdmin(c, identity.identity.userId, logger);
      if (denied) return denied;
      const taskWorker = getTaskWorker(registry);
      if (!taskWorker) {
        return c.json({ error: 'Enrichment service unavailable', details: 'TaskWorker not initialized' }, 503);
      }
      const { userId, username, projectId } = identity.identity;
      const repo = taskWorker.getRepository();
      // Auto-purge orphan tasks before retry (entries deleted but tasks remain)
      const purgedCount = await repo.reconcileOrphans();
      if (purgedCount > 0) {
        logger.info({ purgedCount }, '[EnrichmentStatus] Auto-purged orphan tasks before retry');
      }
      const resetCount = await repo.retryAllFailed({ projectScope: projectId, limit: RETRY_FAILED_LIMIT });
      await writeRetryAudit(logger, userId, username, projectId, resetCount, RETRY_FAILED_LIMIT);
      logger.info({ actor: userId, projectScope: projectId, resetCount, purgedCount, limit: RETRY_FAILED_LIMIT }, '[EnrichmentStatus] Retry failed tasks');
      return c.json({
        data: {
          resetCount, purgedCount, limit: RETRY_FAILED_LIMIT, excluded: 'terminal',
          message: `${purgedCount} orphans purged, ${resetCount} failed tasks reset to pending (limit ${RETRY_FAILED_LIMIT}, terminal errors excluded)`,
        },
        error: null,
      });
    } catch (err: any) {
      logger.error({ err }, '[EnrichmentStatus] Retry failed tasks error');
      return c.json({ error: 'Failed to retry tasks', details: err.message }, 500);
    }
  });

  /**
   * POST /api/v1/enrichment/reconcile-orphans — purge orphan tasks whose
   * symbols/entries were deleted. SA4E-338 S1 (D-SEC-01): admin-gated + rate-limited.
   */
  app.post('/enrichment/reconcile-orphans', rateLimiter, jwtAuth, async (c) => {
    try {
      const identity = await resolveJwtIdentity(c);
      if (!identity.ok) return identityDenied(c, identity);
      const denied = await requireEnrichmentAdmin(c, identity.identity.userId, logger);
      if (denied) return denied;
      const taskWorker = getTaskWorker(registry);
      if (!taskWorker) {
        return c.json({ error: 'Enrichment service unavailable', details: 'TaskWorker not initialized' }, 503);
      }
      const repo = taskWorker.getRepository();
      const purgedCount = await repo.reconcileOrphans();
      logger.info({ purgedCount, actor: identity.identity.userId }, '[EnrichmentStatus] Reconciled orphan tasks');
      return c.json({ data: { purgedCount, message: `${purgedCount} orphan tasks deleted` }, error: null });
    } catch (err: any) {
      logger.error({ err }, '[EnrichmentStatus] Reconcile orphans error');
      return c.json({ error: 'Failed to reconcile orphans', details: err.message }, 500);
    }
  });

  return app;
}

/** SA4E-338 S1 (D-SEC-02): audit trail for retry mutations — audit failure never blocks the operation. */
async function writeRetryAudit(
  logger: Logger, actor: string, username: string, projectScope: string, resetCount: number, limit: number,
): Promise<void> {
  try {
    await recordAudit(actor, username, 'enrichment_retry', 'enrichment', projectScope, JSON.stringify({ resetCount, limit }));
  } catch (err) {
    logger.warn({ err, actor, projectScope }, '[EnrichmentStatus] audit write failed');
  }
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
