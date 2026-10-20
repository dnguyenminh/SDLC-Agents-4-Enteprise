/**
 * Source/document indexing endpoints — POST /api/index/source|document|documents.
 * SA4E-41: every write is path-safe (SEC-04/05) and tenant-scoped (requireProjectId).
 * Facade (BR-18): implementations live in sibling modules — api-index-concurrency.ts,
 * api-index-paths.ts, api-index-auth.ts, api-index-handlers.ts, api-index-sync.ts.
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import {
  handleFullIndex, handleFileEvents, handleCancel, handleProgress,
} from './api-index-decoupled.js';
import { requireAuth } from './api-index-auth.js';
import { getIndexConcurrencyLimit } from './api-index-concurrency.js';
import { handleIndexSource, handleIndexDocument, handleIndexDocuments } from './api-index-handlers.js';
import { handleIngestDocsFromTemp, handleSyncPegaRules } from './api-index-sync.js';

export {
  getIndexConcurrencyLimit, setIndexConcurrencyLimit, loadPersistedIndexLimit,
} from './api-index-concurrency.js';
export {
  sanitizePathSegment, resolveIndexTempBase, resolveSafeTargetPath,
} from './api-index-paths.js';
export { clearIndexPermissionCache } from './api-index-auth.js';
export { indexError } from './api-index-handlers.js';

// SA4E-99: Server-side backpressure — active /api/index/source request counter.
let activeIndexRequests = 0;

/** Register the /api/index/* routes on the given app. */
export function registerIndexRoutes(app: Hono, registry: ModuleRegistry, logger: Logger): void {
  app.post('/api/index/source', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized', details: 'Missing or invalid Authorization header', action: 'Provide valid Bearer token' }, 401);
    // SA4E-99: Backpressure — reject with 429 if too many concurrent requests
    const concurrencyLimit = getIndexConcurrencyLimit();
    if (activeIndexRequests >= concurrencyLimit) {
      return c.json({ error: 'Server busy', details: `Active index requests >= ${concurrencyLimit}`, action: 'Retry after 2 seconds', retryAfter: 2 }, 429);
    }
    activeIndexRequests++;
    try {
      return await handleIndexSource(c, registry, logger, session.userId);
    } finally {
      activeIndexRequests--;
    }
  });
  app.post('/api/index/document', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized', details: 'Missing or invalid Authorization header', action: 'Provide valid Bearer token' }, 401);
    return handleIndexDocument(c, logger, session.userId);
  });
  app.post('/api/index/documents', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized', details: 'Missing or invalid Authorization header', action: 'Provide valid Bearer token' }, 401);
    return handleIndexDocuments(c, logger, session.userId);
  });

  // SA4E-78: Decoupled indexer endpoints
  app.post('/api/index/full', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized', details: 'Missing or invalid Authorization header', action: 'Provide valid Bearer token' }, 401);
    return handleFullIndex(c, registry, logger);
  });
  app.post('/api/index/file-events', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized', details: 'Missing or invalid Authorization header', action: 'Provide valid Bearer token' }, 401);
    return handleFileEvents(c, registry, logger);
  });
  // SA4E-99: Ingest documents from Temp folder into KB
  app.post('/api/index/ingest-docs', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized', details: 'Missing or invalid Authorization header', action: 'Provide valid Bearer token' }, 401);
    return handleIngestDocsFromTemp(c, registry, logger, session.userId);
  });
  // SA4E-209: Sync Pega rules to KB (graph projection)
  app.post('/api/index/sync-pega-rules', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized', details: 'Missing or invalid Authorization header', action: 'Provide valid Bearer token' }, 401);
    return handleSyncPegaRules(c, registry, logger, session.userId);
  });
  app.post('/api/index/cancel', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized', details: 'Missing or invalid Authorization header', action: 'Provide valid Bearer token' }, 401);
    return handleCancel(c, registry, logger);
  });
  app.get('/api/index/progress', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized', details: 'Missing or invalid Authorization header', action: 'Provide valid Bearer token' }, 401);
    return handleProgress(c, registry, logger);
  });
}
