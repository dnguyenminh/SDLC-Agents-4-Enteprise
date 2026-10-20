/**
 * Index ingest/sync handlers — extracted from api-index.ts (BR-18).
 * SA4E-99: ingest docs from Temp into KB. SA4E-209: Pega rules sync trigger.
 */
import type { Context } from 'hono';
import * as fs from 'fs';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import {
  collectIngestFiles, ingestFilesFromTemp, type IngestTenant,
} from './api-index-ingest.js';
import { PegaService } from '../../modules/pega/PegaService.js';
import { requireIndexPermission, verifyIndexProjectBinding } from './api-index-auth.js';
import { resolveIndexTempBase } from './api-index-paths.js';
import { indexError, resolveRequestScope } from './api-index-handlers.js';

/**
 * SA4E-99: Scan Temp/{userId}/{projectId}/batch-docs/ and ingest all markdown files into KB.
 * Called ONCE after all document batches are written to Temp.
 *
 * SA4E-337 FIX:
 * - Derive type from file path pattern (BRD/FSD→REQUIREMENT, TDD→ARCHITECTURE, STP/STC/DPG/RLN/UG→PROCEDURE)
 * - Extract tags from file path (SA4E-* → sa4e, ticket key)
 * - Also process .drawio files (Bug #4)
 *
 * SA4E-337-QA-001 (CRITICAL): use the memory module's scoped mem_ingest_file TOOL
 * HANDLER (getToolHandlers) — MemoryModule has NO getDispatcher() method, so the
 * previous `mem.getDispatcher()` call threw "mem.getDispatcher is not a function"
 * → HTTP 500. The handler is wrapped with withScopeContext(), which injects the
 * trusted tenant scope from the args → knowledge_entries.project_id stays populated
 * (bare mem.dispatcher.dispatch() would leave it NULL).
 */
export async function handleIngestDocsFromTemp(c: Context, registry: ModuleRegistry, logger: Logger, userId: string) {
  try {
    const scope = resolveRequestScope(c);
    // SA4E-300 SEC High #1 (BOLA): global write gate + tenant binding.
    const ingestForbidden = await requireIndexPermission(c, userId, 'KB_WRITE', logger);
    if (ingestForbidden) return ingestForbidden;
    const ingestBindingDenied = await verifyIndexProjectBinding(c, scope.projectId, logger);
    if (ingestBindingDenied) return ingestBindingDenied;
    // SA4E-300 GAP 1: sanitized cross-platform base {indexTempDir}/{userId}/{projectId}/batch-docs/
    const tempBase = resolveIndexTempBase(userId, scope.projectId, 'batch-docs');

    if (!fs.existsSync(tempBase)) {
      return c.json({ ingested: 0, message: 'No documents in Temp folder' });
    }

    // Recursively find all ingestable files (.md/.txt/.drawio) in temp docs folder
    const files = collectIngestFiles(tempBase);

    // SA4E-337-QA-001: resolve the mem_ingest_file tool handler (scoped dispatcher path)
    const mem = registry.getModule('memory');
    if (!mem || mem.status !== 'ready') {
      return c.json({ error: 'Memory module not ready', details: 'Memory service is initializing', action: 'Retry after a short delay' }, 503);
    }
    const ingestHandler = mem.getToolHandlers().get('mem_ingest_file');
    if (!ingestHandler) {
      return c.json({ error: 'Memory module not ready', details: 'mem_ingest_file tool handler is unavailable', action: 'Retry after a short delay' }, 503);
    }

    const tenant: IngestTenant = { userId, projectId: scope.projectId };
    const outcome = await ingestFilesFromTemp(files, tempBase, ingestHandler, tenant, logger);

    logger.info({ ingested: outcome.ingested, errors: outcome.errors, total: outcome.total }, '[ingest-docs] Document ingest complete');
    return c.json(outcome);
  } catch (err: any) {
    return indexError(c, err, logger, 'Error ingesting documents from Temp');
  }
}

/** SA4E-209: Trigger async Pega rules sync — returns 202 immediately, runs in background. */
export async function handleSyncPegaRules(c: Context, registry: ModuleRegistry, logger: Logger, userId = '') {
  try {
    const body = await c.req.json<{ projectId?: string }>();
    if (!body.projectId) {
      // SA4E-300 GAP 2: full {error, details, action} shape (keep 400)
      return c.json({ error: 'projectId is required', details: 'Request body must contain a non-empty projectId field', action: 'Include projectId in request body' }, 400);
    }
    // SA4E-300 SEC High #2: same gate as populate-edges (GRAPH_MAINTAIN, kb-graph.ts:104).
    const syncForbidden = await requireIndexPermission(c, userId, 'GRAPH_MAINTAIN', logger);
    if (syncForbidden) return syncForbidden;
    // SA4E-300 SEC High #1 (BOLA): body.projectId must be inside the caller's JWT grant.
    const syncBindingDenied = await verifyIndexProjectBinding(c, body.projectId, logger);
    if (syncBindingDenied) return syncBindingDenied;
    const memModule = registry.getModule('memory') as any;
    if (!memModule || memModule.status !== 'ready') {
      // SA4E-300 GAP 2: full {error, details, action} shape (keep 503)
      return c.json({ error: 'Memory module not ready', details: 'Memory service is initializing or unavailable; sync cannot start yet', action: 'Wait for server initialization' }, 503);
    }
    // Fire-and-forget: run sync in background, report via progress polling
    const service = new PegaService(memModule.getEngine());
    service.syncIndexedRulesToKb(body.projectId)
      .then((result) => {
        logger.info({ projectId: body.projectId, synced: result.synced, errors: result.errors },
          '[sync-pega-rules] Pega graph sync complete');
      })
      .catch((err: any) => {
        logger.error({ err, projectId: body.projectId }, '[sync-pega-rules] Background sync failed');
      });
    return c.json({
      status: 'started',
      message: 'Pega sync started — poll GET /api/index/progress for status',
      projectId: body.projectId,
    }, 202);
  } catch (err: any) {
    // SA4E-300 GAP 2: route 500 through centralized indexError (keeps {error, details, action})
    return indexError(c, err, logger, '[sync-pega-rules] Failed to start');
  }
}
