/**
 * SA4E-78 — Decoupled indexer endpoints (facade).
 * SRP: separated from legacy api-index.
 * POST /api/index/full — trigger async full index (202 Accepted)
 * POST /api/index/file-events — push file change events from Extension
 * POST /api/index/cancel — cancel running index via AbortController
 * GET  /api/index/progress — poll current progress
 *
 * Implementation submodules (same directory):
 * - api-index-scope.ts       — singleton manager + tenant/workspace scope
 * - api-index-file-events.ts — incremental file-event ingestion
 */

import type { Context } from 'hono';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { getManager, resolveScope } from './api-index-scope.js';
import { handleFileEvents } from './api-index-file-events.js';

// Preserve the original public API at this module path (api-index.ts imports these).
export { getManager, resolveScope, handleFileEvents };

/**
 * POST /api/index/full — Trigger async full index.
 * @returns 202 with operationId, or 409 if already running.
 */
export async function handleFullIndex(c: Context, registry: ModuleRegistry, logger: Logger) {
  try {
    const scope = await resolveScope(c);
    const manager = getManager(registry);
    if (!manager) return c.json({ error: 'Code intelligence not ready' }, 503);

    // BR-11: auto-cancel any existing op and start a new one (unified 200 response).
    const result = await manager.startOrReplace(scope.userId, scope.projectId, scope);

    logger.info(
      { operationId: result.operation.operationId, projectId: scope.projectId, cancelledPrevious: result.cancelledPrevious },
      '[index] Full index started',
    );
    return c.json({
      operationId: result.operation.operationId,
      projectId: scope.projectId,
      status: 'running',
      message: result.cancelledPrevious
        ? 'Previous operation cancelled, new index started'
        : 'Full index started',
      cancelledPrevious: result.cancelledPrevious,
      cancelledOperationId: result.cancelledOperationId,
    }, 200);
  } catch (err: unknown) {
    return handleError(c, err, logger, 'Error starting full index');
  }
}

/**
 * POST /api/index/cancel — Cancel running index operation.
 * @returns 200 with cancelled status, or 404 if no active operation.
 */
export async function handleCancel(c: Context, registry: ModuleRegistry, logger: Logger) {
  try {
    const scope = await resolveScope(c);
    const manager = getManager(registry);
    if (!manager) return c.json({ error: 'Code intelligence not ready' }, 503);

    const op = manager.cancelOperation(scope.userId, scope.projectId);
    if (!op) {
      return c.json({ error: 'No active index operation', projectId: scope.projectId }, 404);
    }

    logger.info({ operationId: op.operationId }, '[index] Cancel signal sent');
    return c.json({
      operationId: op.operationId,
      status: 'cancelling',
      message: 'Cancellation signal sent',
    });
  } catch (err: unknown) {
    return handleError(c, err, logger, 'Error cancelling index');
  }
}

/**
 * GET /api/index/progress — Poll current indexing progress.
 * @returns Current progress snapshot (idle if no operation).
 */
export async function handleProgress(c: Context, registry: ModuleRegistry, logger: Logger) {
  try {
    const scope = await resolveScope(c);
    const manager = getManager(registry);
    if (!manager) return c.json({ error: 'Code intelligence not ready' }, 503);

    // Hot-path first, cold-path (DB) fallback for post-restart durability.
    const progress = await manager.getProgress(scope.userId, scope.projectId);
    return c.json(progress);
  } catch (err: unknown) {
    return handleError(c, err, logger, 'Error reading index progress');
  }
}

/** Shared error handler for decoupled endpoints. */
function handleError(c: Context, err: unknown, logger: Logger, context: string) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith('PROJECT_REQUIRED')) {
    return c.json({ error: 'X-Project-Id required' }, 400);
  }
  logger.error({ err }, context);
  return c.json({ error: 'Internal error' }, 500);
}
