/**
 * Source/document indexing endpoints — POST /api/index/source|document|documents.
 * SA4E-41: every write is path-safe (SEC-04/05) and tenant-scoped (requireProjectId).
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Logger } from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { loadConfig } from '../../config/index.js';
import { requireProjectId } from '../../engine/query/code-intel-isolation.js';
import { validateSession } from '../../admin/db/sessions.js';
import {
  handleFullIndex, handleFileEvents, handleCancel, handleProgress, resolveScope,
} from './api-index-decoupled.js';
import { PegaService } from '../../modules/pega/PegaService.js';
import { UNIFIED_EXTENSIONS } from '../../config/unified-extensions';

interface SourceFile {
  path: string;
  content: string;
  gitHash?: string;
  checksum?: string;
}
interface IndexScope { projectId: string; workspace: string }

// SA4E-99: Server-side backpressure — limit concurrent index requests
const INDEX_CONCURRENCY_LIMIT = 3;
let activeIndexRequests = 0;

/** Resolve request scope from trusted headers, falling back to boot config. */
function resolveRequestScope(c: Context): IndexScope {
  const config = loadConfig();
  const projectId = requireProjectId(c.req.header('X-Project-Id') || config.projectId);
  const workspace = c.req.header('X-Workspace-Root') || config.workspace;
  return { projectId, workspace };
}

/** Extract userId from Bearer token (non-fatal — returns '' if unauthenticated). */
// NOTE: resolveUserId kept for backward compatibility but auth is now enforced at route level

/** Phase: write files to disk under the workspace, rejecting unsafe paths. */
function writeFilesPhase(userId: string, projectId: string, files: SourceFile[]): { written: number; rejected: string[] } {
  const rejected: string[] = [];
  let written = 0;
  // SA4E-99: Consistent temp structure — indexTempDir/{userId}/{projectId}/batch-docs/
  const config = loadConfig();
  const tempBase = path.join(config.indexTempDir, userId || 'local-dev', projectId, 'batch-docs');
  fs.mkdirSync(tempBase, { recursive: true });
  for (const file of files) {
    const targetPath = path.join(tempBase, file.path);
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, file.content, 'utf-8');
      written++;
    } catch { rejected.push(file.path); }
  }
  return { written, rejected };
}


/** Require valid session — returns 401 if not authenticated. */
async function requireAuth(c: Context): Promise<{ userId: string } | null> {
  const auth = c.req.header('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  const session = await validateSession(token);
  return session ?? null;
}

/** Register the /api/index/* routes on the given app. */
export function registerIndexRoutes(app: Hono, registry: ModuleRegistry, logger: Logger): void {
  app.post('/api/index/source', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    // SA4E-99: Backpressure — reject with 429 if too many concurrent requests
    if (activeIndexRequests >= INDEX_CONCURRENCY_LIMIT) {
      return c.json({ error: 'Server busy', retryAfter: 2 }, 429);
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
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleIndexDocument(c, logger, session.userId);
  });
  app.post('/api/index/documents', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleIndexDocuments(c, logger, session.userId);
  });

  // SA4E-78: Decoupled indexer endpoints
  app.post('/api/index/full', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleFullIndex(c, registry, logger);
  });
  app.post('/api/index/file-events', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleFileEvents(c, registry, logger);
  });
  // SA4E-99: Ingest documents from Temp folder into KB
  app.post('/api/index/ingest-docs', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleIngestDocsFromTemp(c, registry, logger, session.userId);
  });
  // SA4E-209: Sync Pega rules to KB (graph projection)
  app.post('/api/index/sync-pega-rules', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleSyncPegaRules(c, registry, logger);
  });
  app.post('/api/index/cancel', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleCancel(c, registry, logger);
  });
  app.get('/api/index/progress', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleProgress(c, registry, logger);
  });
}

async function handleIndexSource(c: Context, registry: ModuleRegistry, logger: Logger, userId = '') {
  try {
    const body = await c.req.json() as { files: SourceFile[] };
    const { files } = body;
    if (!files || !Array.isArray(files)) return c.json({ error: 'files array required' }, 400);
    const scope = resolveRequestScope(c);

    // SINGLE SOURCE OF TRUTH: write to the SAME dir that /api/index/full scans
    // (via the shared resolveScope), so uploaded files are actually indexed and
    // progress is keyed by the same userId:projectId. Previously this wrote to a
    // hardcoded/`/source`-suffixed path that the index/progress routes never scanned.
    const indexScope = resolveScope(c);
    const tempBase = indexScope.workspace;
    const wsBasename = path.basename(scope.workspace);
    fs.mkdirSync(tempBase, { recursive: true });

    const written: string[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      let filePath = file.path;
      // Strip workspace prefix if present
      if (filePath.startsWith(wsBasename + '/') || filePath.startsWith(wsBasename + '\\')) {
        filePath = filePath.substring(wsBasename.length + 1);
      }
      // Path safety: reject traversal
      if (filePath.includes('..') || path.isAbsolute(filePath)) {
        rejected.push(file.path);
        continue;
      }
      // Extension validation against unified whitelist
      const ext = path.extname(filePath).slice(1).toLowerCase();
      if (!UNIFIED_EXTENSIONS.includes(ext as any)) {
        rejected.push(file.path);
        continue;
      }
      const targetPath = path.join(tempBase, filePath);
      try {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, file.content, 'utf-8');
        written.push(filePath);
      } catch { rejected.push(file.path); }
    }

    // NOTE: This endpoint ONLY writes uploaded files to the shared index temp dir.
    // It does NOT trigger indexing here — the client is expected to POST
    // /api/index/full ONCE after all batches are written. Triggering per-batch
    // caused: (a) startOrReplace cancelling+restarting on partial dirs (race), and
    // (b) a throwaway IndexOperationManager whose progress was invisible to
    // /api/index/progress (which reads the singleton) → status stuck at 0%.
    // See documents/index-status-tooltip-error-detail.md ("ROOT CAUSE CHỐT").

    return c.json({ written: written.length, skipped: 0, rejected, deps: [], projectId: scope.projectId });
  } catch (err: any) {
    return indexError(c, err, logger, 'Error processing source batch');
  }
}

async function handleIndexDocument(c: Context, logger: Logger, userId = '') {
  try {
    const body = await c.req.json() as { path: string; content: string };
    const { path: relPath, content } = body;
    if (!relPath || !content) return c.json({ error: 'path and content required' }, 400);
    const scope = resolveRequestScope(c);
    // SA4E-99: Consistent temp structure — indexTempDir/{userId}/{projectId}/documents/
    const config = loadConfig();
    const tempBase = path.join(config.indexTempDir, userId || 'local-dev', scope.projectId, 'documents');
    const wsBasename = path.basename(scope.workspace);
    let filePath = relPath;
    if (filePath.startsWith(wsBasename + '/') || filePath.startsWith(wsBasename + '\\')) {
      filePath = filePath.substring(wsBasename.length + 1);
    }
    const targetPath = path.join(tempBase, filePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf-8');
    return c.json({ success: true });
  } catch (err: any) {
    return indexError(c, err, logger, 'Error writing document');
  }
}

async function handleIndexDocuments(c: Context, logger: Logger, userId = '') {
  try {
    const body = await c.req.json() as { files: SourceFile[] };
    const { files } = body;
    if (!files || !Array.isArray(files)) return c.json({ error: 'files array required' }, 400);
    const scope = resolveRequestScope(c);
    const { written, rejected } = writeFilesPhase(userId, scope.projectId, files);
    if (rejected.length > 0) logger.warn({ rejected, projectId: scope.projectId }, '[index] rejected unsafe paths');
    return c.json({ indexed: written, rejected });
  } catch (err: any) {
    return indexError(c, err, logger, 'Error writing documents batch');
  }
}

/**
 * SA4E-99: Scan Temp/{userId}/{projectId}/batch-docs/ and ingest all markdown files into KB.
 * Called ONCE after all document batches are written to Temp.
 */
async function handleIngestDocsFromTemp(c: Context, registry: ModuleRegistry, logger: Logger, userId: string) {
  try {
    const scope = resolveRequestScope(c);
    const config = loadConfig();
    const tempBase = path.join(config.indexTempDir, userId, scope.projectId, 'batch-docs');

    if (!fs.existsSync(tempBase)) {
      return c.json({ ingested: 0, message: 'No documents in Temp folder' });
    }

    // Recursively find all files in temp docs folder
    const files: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); }
        else if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) { files.push(full); }
      }
    }
    walk(tempBase);

    // Ingest each file via mem_ingest_file handler
    const mem = registry.getModule('memory') as any;
    if (!mem || mem.status !== 'ready') {
      return c.json({ error: 'Memory module not ready' }, 503);
    }
    const dispatcher = mem.getDispatcher();
    let ingested = 0;
    let errors = 0;

    for (const filePath of files) {
      const relPath = path.relative(tempBase, filePath).replace(/\\/g, '/');
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        await dispatcher.dispatch('mem_ingest_file', {
          file_path: relPath,
          content,
          type: 'CONTEXT',
          scope: 'PROJECT',
        });
        ingested++;
      } catch (err) {
        errors++;
        logger.warn({ err, file: relPath }, '[ingest-docs] Failed to ingest document');
      }
    }

    logger.info({ ingested, errors, total: files.length }, '[ingest-docs] Document ingest complete');
    return c.json({ ingested, errors, total: files.length });
  } catch (err: any) {
    return indexError(c, err, logger, 'Error ingesting documents from Temp');
  }
}

/** SA4E-209: Trigger async Pega rules sync — returns 202 immediately, runs in background. */
async function handleSyncPegaRules(c: Context, registry: ModuleRegistry, logger: Logger) {
  try {
    const body = await c.req.json<{ projectId?: string }>();
    if (!body.projectId) {
      return c.json({ error: 'projectId is required', action: 'Include projectId in request body' }, 400);
    }
    const memModule = registry.getModule('memory') as any;
    if (!memModule || memModule.status !== 'ready') {
      return c.json({ error: 'Memory module not ready', action: 'Wait for server initialization' }, 503);
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
    logger.error({ err }, '[sync-pega-rules] Failed to start');
    return c.json({ error: 'Pega sync failed', details: err.message }, 500);
  }
}

/** Map errors to responses — PROJECT_REQUIRED → 400, everything else → 500. */
function indexError(c: Context, err: any, logger: Logger, context: string) {
  if (String(err?.message).startsWith('PROJECT_REQUIRED')) {
    return c.json({ error: 'X-Project-Id required for indexing' }, 400);
  }
  logger.error({ err }, context);
  return c.json({ error: 'Internal error' }, 500);
}
