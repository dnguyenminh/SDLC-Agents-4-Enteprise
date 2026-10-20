/**
 * SA4E-157 — Enrichment Status Route (facade).
 * GET /api/v1/enrichment/status — returns current LLM enrichment progress.
 * GET /api/v1/enrichment/failures + POST retry-failed / reconcile-orphans
 * (SA4E-338 S1: admin-gated, rate-limited, project-scoped).
 * JWT auth required (backend is remote), no admin permission check (read-only data).
 *
 * Implementation submodules (same directory):
 * - enrichment-status-response.ts — status payload aggregation (BR-02/BR-08)
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { rateLimiter } from '../middleware/rate-limiter.js';
import { recordAudit } from '../../admin/admin-db.js';
import { resolveJwtIdentity, requireEnrichmentAdmin, identityDenied } from './enrichment-auth-guard.js';
import { buildStatusResponse } from './enrichment-status-response.js';
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
   * SA4E-338 S1 (D-SEC-01) + rev B: rate-limited + admin-gated; project scope comes
   * from the `X-Project-Id` header (JWT supplies identity only — see
   * enrichment-auth-guard.ts).
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
   * tasks to pending. SA4E-338 S1 (D-SEC-01/02) + rev B: admin-gated + rate-limited +
   * X-Project-Id-scoped; `retryAllFailed` excludes terminal `budget_error:`/`llm_auth:`
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
