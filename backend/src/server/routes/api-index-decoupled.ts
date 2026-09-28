/**
 * SA4E-78 — Decoupled indexer endpoints (SRP: separated from legacy api-index).
 * POST /api/index/full — trigger async full index (202 Accepted)
 * POST /api/index/file-events — push file change events from Extension
 * POST /api/index/cancel — cancel running index via AbortController
 * GET  /api/index/progress — poll current progress
 */

import type { Context } from 'hono';
import type { Logger } from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import type { CodeIntelModule } from '../../modules/code-intel/CodeIntelModule.js';
import { IndexOperationManager } from '../../engine/indexer/index-operation-manager.js';
import { loadConfig } from '../../config/index.js';
import { resolveIndexTempDir } from './index-temp-dir.js';
import { requireProjectId } from '../../engine/query/code-intel-isolation.js';
import { resolveWithinWorkspace } from '../../shared/path-safety.js';
import type { FileEvent, FileEventsResult } from '../../engine/indexer/types.js';

/** Max events per request to prevent abuse. */
const MAX_EVENTS_PER_REQUEST = 100;

/** Singleton manager map — one per CodeIntelModule lifetime. */
const managerCache = new WeakMap<object, IndexOperationManager>();

/**
 * Get or create the SINGLETON IndexOperationManager for the codeIntel module.
 * Exported so all index routes (source upload + full + progress) share ONE
 * manager instance — otherwise progress written by one route is invisible to
 * another (each manager only tracks its own operations), and each extra
 * instance leaks an `engine.on('progress')` listener.
 */
export function getManager(registry: ModuleRegistry): IndexOperationManager | null {
  const codeIntel = registry.getModule('codeIntel') as CodeIntelModule | undefined;
  if (!codeIntel || codeIntel.status !== 'ready') return null;
  const indexer = codeIntel.getIndexer();
  if (!indexer) return null;

  let manager = managerCache.get(codeIntel);
  if (!manager) {
    manager = new IndexOperationManager(indexer);
    managerCache.set(codeIntel, manager);
  }
  return manager;
}

/** Resolve project scope from request headers (multi-tenant via JWT + X-Project-Id). */
async function resolveScope(c: Context, sessionUserId?: string): Promise<{ userId: string; projectId: string; workspace: string; displayName?: string }> {
  const config = loadConfig();
  const projectId = requireProjectId(c.req.header('X-Project-Id') || config.projectId);
  // Prefer explicit session user, then JWT projectContext (multi-tenant), then default.
  const ctx = c.get('projectContext') as { userId?: string; projectId?: string } | undefined;
  const userId = sessionUserId || ctx?.userId || 'default';
  // Use the resolved indexTempDir (single source of truth) instead of a
  // hardcoded KIRO_TEMP_DIR/kiro default.
  const indexTempDir = await resolveIndexTempDir();
  const workspace = path.join(indexTempDir, userId, projectId);
  if (!fs.existsSync(workspace)) fs.mkdirSync(workspace, { recursive: true });
  // The scan `workspace` above is a synthetic temp dir named after the projectId,
  // so its basename is NOT a usable display name. The client sends its REAL
  // workspace root via X-Workspace-Root — use that for project_registry.display_name.
  const workspaceRoot = c.req.header('X-Workspace-Root') || c.req.header('x-workspace-root');
  const displayName = workspaceRoot ? path.basename(workspaceRoot) : undefined;
  return { userId, projectId, workspace, displayName };
}

/**
 * POST /api/index/full — Trigger async full index.
 * @returns 202 with operationId, or 409 if already running.
 */
export async function handleFullIndex(c: Context, registry: ModuleRegistry, logger: Logger, userId?: string) {
  try {
    const scope = await resolveScope(c, userId);
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
 * POST /api/index/file-events — Receive file change events from Extension.
 * Processes sequentially to avoid DB contention.
 */
export async function handleFileEvents(c: Context, registry: ModuleRegistry, logger: Logger) {
  try {
    const scope = await resolveScope(c);
    const body = await c.req.json() as { events: FileEvent[] };
    const { events } = body;

    if (!events || !Array.isArray(events)) {
      return c.json({ error: 'events array required' }, 400);
    }
    if (events.length > MAX_EVENTS_PER_REQUEST) {
      return c.json({ error: `Max ${MAX_EVENTS_PER_REQUEST} events per request` }, 413);
    }

    const codeIntel = registry.getModule('codeIntel') as CodeIntelModule | undefined;
    const indexer = codeIntel?.getIndexer() as any;
    if (!indexer) return c.json({ error: 'Code intelligence not ready' }, 503);

    const result: FileEventsResult = {
      indexed: 0, updated: 0, removed: 0,
      skipped: 0, rejected: [], projectId: scope.projectId,
    };

    for (const event of events) {
      const processed = await processFileEvent(
        event, scope, indexer, logger,
      );
      if (processed === 'rejected') result.rejected.push(event.path);
      else if (processed === 'indexed') result.indexed++;
      else if (processed === 'updated') result.updated++;
      else if (processed === 'removed') result.removed++;
      else result.skipped++;
    }

    return c.json(result);
  } catch (err: unknown) {
    return handleError(c, err, logger, 'Error processing file events');
  }
}

/** Process a single file event — returns outcome category. */
async function processFileEvent(
  event: FileEvent,
  scope: { projectId: string; workspace: string },
  indexer: any,
  logger: Logger,
): Promise<'indexed' | 'updated' | 'removed' | 'skipped' | 'rejected'> {
  const safePath = resolveWithinWorkspace(scope.workspace, event.path);
  if (!safePath) return 'rejected';

  if (event.type === 'delete') {
    indexer.removeFile(event.path);
    return 'removed';
  }

  // For add/change: write content if provided, then index
  if (event.content) {
    fs.mkdirSync(path.dirname(safePath), { recursive: true });
    fs.writeFileSync(safePath, event.content, 'utf-8');
  }

  try {
    // F-01: pass the already-validated/contained safePath (not the raw event.path)
    // so a symlink submitted in event.path cannot be followed outside the workspace.
    await indexer.indexSingleFile(safePath, scope.projectId);
    return event.type === 'add' ? 'indexed' : 'updated';
  } catch (err) {
    logger.warn({ err, file: event.path }, '[index] file-event index failed');
    return 'skipped';
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
export async function handleProgress(c: Context, registry: ModuleRegistry, _logger: Logger) {
  const scope = await resolveScope(c);
  const manager = getManager(registry);
  if (!manager) return c.json({ error: 'Code intelligence not ready' }, 503);

  // Hot-path first, cold-path (DB) fallback for post-restart durability.
  const progress = await manager.getProgress(scope.userId, scope.projectId);
  return c.json(progress);
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
