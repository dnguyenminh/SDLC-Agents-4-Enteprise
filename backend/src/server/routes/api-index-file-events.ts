/**
 * SA4E-78 — POST /api/index/file-events handler.
 * Extracted from api-index-decoupled.ts: incremental file change events from
 * the Extension, processed sequentially with path-safety containment (F-01).
 */

import type { Context } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import type { CodeIntelModule } from '../../modules/code-intel/CodeIntelModule.js';
import { resolveWithinWorkspace } from '../../shared/path-safety.js';
import type { FileEvent, FileEventsResult } from '../../engine/indexer/types.js';
import { resolveScope } from './api-index-scope.js';

/** Max events per request to prevent abuse. */
const MAX_EVENTS_PER_REQUEST = 100;

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

    // ROOT-CAUSE FIX: incremental tenants never run runFullIndex, so nothing
    // ever wrote project_registry for them (empty admin dropdown). Register the
    // project once per batch here — non-fatal, indexing continues on failure.
    try {
      await indexer.registerWorkspace(scope.projectId, scope.workspace, scope.displayName);
    } catch (err) {
      logger.warn({ err, projectId: scope.projectId }, '[index] project_registry register skipped (non-fatal)');
    }

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

/** Shared error handler for decoupled endpoints. */
function handleError(c: Context, err: unknown, logger: Logger, context: string) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith('PROJECT_REQUIRED')) {
    return c.json({ error: 'X-Project-Id required' }, 400);
  }
  logger.error({ err }, context);
  return c.json({ error: 'Internal error' }, 500);
}
