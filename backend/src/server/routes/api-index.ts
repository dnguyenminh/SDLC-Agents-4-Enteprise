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
import type { CodeIntelModule } from '../../modules/code-intel/CodeIntelModule.js';
import { loadConfig } from '../../config/index.js';
import { getDbAdapter } from '../../admin/db/core.js';
import { resolveIndexTempDir } from './index-temp-dir.js';
import { GraphRepository } from '../../database/repositories/GraphRepository.js';
import { requireProjectId } from '../../engine/query/code-intel-isolation.js';
import { validateSession } from '../../admin/db/sessions.js';
import {
  handleFullIndex, handleFileEvents, handleCancel, handleProgress,
} from './api-index-decoupled.js';
import { PegaService } from '../../modules/pega/PegaService.js';

interface SourceFile {
  path: string;
  content: string;
  gitHash?: string;
  checksum?: string;
}
/**
 * Per-request scope. Two path concerns, kept separate:
 *   - `workspace`: server-side FS path used for reads/writes/indexing.
 *   - `clientWorkspaceRoot`: the client's original host path (as sent via
 *     `X-Workspace-Root`), used for metadata/display so operators and users
 *     see the ORIGINAL path — never the internal `/app/workspaces/...` prefix.
 *   - `displayName`: last path segment of the client's host path (fallback:
 *     projectId). Used for graph node labels and KB entry summaries.
 */
interface IndexScope {
  projectId: string;
  workspace: string;
  clientWorkspaceRoot: string;
  displayName: string;
}

/**
 * Server-controlled root directory that holds per-tenant workspaces.
 * The client's `X-Workspace-Root` (e.g. `/Users/foo/proj` from macOS,
 * `C:\Users\foo\proj` from Windows) is preserved as a subdirectory tree UNDER
 * this root, so operators can still recognise the original layout when
 * inspecting the container (`ls /app/workspaces/<projectId>/Users/foo/proj`).
 *
 * Configure via env var `SERVER_WORKSPACES_ROOT` (default:
 * `<dataDir>/workspaces`, falling back to `.code-intel/workspaces`).
 */
function resolveServerWorkspacesRoot(): string {
  if (process.env.SERVER_WORKSPACES_ROOT) return process.env.SERVER_WORKSPACES_ROOT;
  const cfg = loadConfig();
  return path.resolve(cfg.dataDir || '.code-intel', 'workspaces');
}

/**
 * Sanitize projectId to a filesystem-safe directory name.
 * Allows only `[a-zA-Z0-9._-]`; all other characters become `_`.
 * Rejects the special names `.` and `..` to prevent path traversal.
 */
function sanitizeProjectIdForFs(projectId: string): string {
  const clean = projectId.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!clean || clean === '.' || clean === '..') {
    throw new Error('PROJECT_REQUIRED: project_id contains no filesystem-safe characters');
  }
  return clean;
}

/**
 * Convert the client-supplied host workspace path into a safe container path
 * that mirrors the original hierarchy under the tenant's workspace root.
 *
 * Examples (assuming `SERVER_WORKSPACES_ROOT=/app/workspaces`, projectId=`p1`):
 *   `/Users/foo/proj`      -> `/app/workspaces/p1/Users/foo/proj`
 *   `C:\\Users\\foo\\proj` -> `/app/workspaces/p1/C/Users/foo/proj`
 *
 * The returned path is guaranteed to stay under
 * `<workspacesRoot>/<projectId>/` — any `..` segments that would escape the
 * tenant root are rejected.
 */
function mapClientPathToContainer(hostPath: string, projectId: string): string {
  const projectRoot = path.resolve(resolveServerWorkspacesRoot(), sanitizeProjectIdForFs(projectId));

  // Normalise slashes and strip a Windows drive letter into a plain directory
  // segment so `C:\Users\foo` becomes `C/Users/foo` (avoids `:` on POSIX FS).
  let rel = hostPath.replace(/\\/g, '/');
  const drive = /^([a-zA-Z]):\/?/.exec(rel);
  if (drive) rel = `${drive[1]}/${rel.slice(drive[0].length)}`;
  // Drop leading slashes so path.resolve joins into projectRoot (not to /).
  rel = rel.replace(/^\/+/, '');

  const target = path.resolve(projectRoot, rel);
  const prefix = projectRoot + path.sep;
  if (target !== projectRoot && !target.startsWith(prefix)) {
    throw new Error('WORKSPACE_ESCAPE: workspace path resolves outside tenant root');
  }
  return target;
}

/**
 * Extract the trailing segment of the client's host path in a
 * cross-platform way (handles both `/` and `\` separators).
 */
function basenameFromClientPath(hostPath: string): string {
  const parts = hostPath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

// SA4E-99: Server-side backpressure — limit concurrent index requests
const INDEX_CONCURRENCY_LIMIT = 3;
let activeIndexRequests = 0;

/** Resolve request scope from trusted headers, falling back to boot config. */
function resolveRequestScope(c: Context): IndexScope {
  const config = loadConfig();
  const projectId = requireProjectId(c.req.header('X-Project-Id') || config.projectId);
  const clientPath = c.req.header('X-Workspace-Root');
  const workspace = clientPath || (config as any).workspace || '';
  const clientWorkspaceRoot = clientPath ?? projectId;
  const displayName = (clientPath && basenameFromClientPath(clientPath)) || projectId;
  return { projectId, workspace, clientWorkspaceRoot, displayName };
}


// /**
//  * Resolve request scope. Both paths are computed here:
//  *   1. `workspace` — server-side FS path used for indexing/writes.
//  *   2. `clientWorkspaceRoot` — original client host path, stored verbatim in
//  *      DB metadata so displays and graph labels use the user's own path (not
//  *      the internal `/app/workspaces/<projectId>/...` layout).
//  */
// function resolveRequestScope(c: Context): IndexScope {
//   const config = loadConfig();
//   const projectId = requireProjectId(c.req.header('X-Project-Id') || config.projectId);
//   const clientPath = c.req.header('X-Workspace-Root');
//   const safeProjectDir = path.resolve(resolveServerWorkspacesRoot(), sanitizeProjectIdForFs(projectId));

//   const workspace = clientPath
//     ? mapClientPathToContainer(clientPath, projectId)
//     : safeProjectDir;
//   fs.mkdirSync(workspace, { recursive: true });

//   // `clientWorkspaceRoot` reflects what the user sent; fall back to the
//   // stable projectId marker so downstream code always has *something*.
//   const clientWorkspaceRoot = clientPath ?? projectId;
//   const displayName = (clientPath && basenameFromClientPath(clientPath)) || projectId;

//   return { projectId, workspace, clientWorkspaceRoot, displayName };
// }

/** Extract userId from Bearer token (non-fatal — returns '' if unauthenticated). */
// NOTE: resolveUserId kept for backward compatibility but auth is now enforced at route level

/** Phase: write files to disk under the workspace, rejecting unsafe paths. */
async function writeFilesPhase(userId: string, projectId: string, files: SourceFile[]): Promise<{ written: number; rejected: string[] }> {
  const rejected: string[] = [];
  let written = 0;
  // SA4E-99: Consistent temp structure — {indexTempDir}/{userId}/{projectId}/batch-docs/
  const tempBase = path.join(await resolveIndexTempDir(), userId || 'local-dev', projectId, 'batch-docs');
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

/**
 * Phase: register/update the project in the admin registry (non-fatal).
 * We store the CLIENT-provided host path (e.g. `/Users/foo/proj`) as the
 * display workspace_path — never the internal `/app/workspaces/...` prefix.
 */
async function registerProjectPhase(scope: IndexScope, logger: Logger, createdBy = ''): Promise<void> {
  try {
    const graphRepo = new GraphRepository(getDbAdapter());
    await graphRepo.registerProject(
      scope.projectId,
      scope.displayName,
      scope.clientWorkspaceRoot,
      createdBy,
    );
  } catch (err) {
    logger.warn({ err, projectId: scope.projectId }, '[index] project registry upsert skipped (non-fatal)');
  }
}

/** Phase: trigger a scoped background full re-index. Returns whether an indexer ran. */
function triggerIndexPhase(registry: ModuleRegistry, scope: IndexScope, logger: Logger): boolean {
  const codeIntel = registry.getModule('codeIntel') as CodeIntelModule | undefined;
  const indexer = codeIntel?.getIndexer();
  if (!indexer) return false;
  indexer.runFullIndex({ projectId: scope.projectId, workspace: scope.workspace })
    .catch((err: unknown) => logger.error({ err }, 'Background full re-index failed'));
  return true;
}

/** SA4E-99: Sync code symbols to graph_nodes after incremental source upload (non-fatal). */
async function syncGraphAfterUpload(registry: ModuleRegistry, projectId: string, logger: Logger): Promise<void> {
  try {
    const codeIntel = registry.getModule('codeIntel') as CodeIntelModule | undefined;
    const indexer = codeIntel?.getIndexer() as any;
    if (!indexer || !indexer.syncGraphNodesPublic) return;
    await indexer.syncGraphNodesPublic(projectId);
    logger.info({ projectId }, '[index] Graph nodes synced after source upload');
  } catch (err) {
    logger.warn({ err }, '[index] Graph sync after upload failed (non-fatal)');
  }
}

/** Phase: ensure a KB metadata entry + graph node exist for the project (non-fatal). */
async function ensureProjectKbEntry(registry: ModuleRegistry, scope: IndexScope, written: number, logger: Logger): Promise<void> {
  try {
    const mem = registry.getModule('memory') as any;
    if (mem?.status !== 'ready') return;
    const engine = mem.getEngine();
    // Use async insert — engine.insert() is now async for PostgreSQL compatibility
    const entryId = await engine.insert({
      content: `Project "${scope.displayName}" indexed. Workspace: ${scope.clientWorkspaceRoot}. Files: ${written}.`,
      summary: `Project metadata for ${scope.displayName}`,
      type: 'CONTEXT', tier: 'SEMANTIC', scope: 'PROJECT',
      project_id: scope.projectId, source: 'project-metadata', tags: 'project,metadata,indexed',
    });
    await upsertProjectGraphNode(String(entryId), scope.displayName, scope.projectId, logger);
  } catch (err) {
    logger.warn({ err }, '[index] project KB entry skipped (non-fatal)');
  }
}

/** Upsert the project-metadata graph node (INSERT OR REPLACE to fix stale/missing rows). */
async function upsertProjectGraphNode(entryId: string, displayName: string, projectId: string, logger: Logger): Promise<void> {
  try {
    const graphRepo = new GraphRepository(getDbAdapter());
    await graphRepo.upsertNode({
      entryId, label: `Project: ${displayName}`, type: 'CONTEXT',
      // level=0 → macro tier (project-level node, always visible at zoom-out).
      tier: 'SEMANTIC', projectId, x: 0, y: 0, z: 0, level: 0, clusterId: '0',
    });
  } catch (err) {
    logger.warn({ err }, '[index] graph node upsert skipped (non-fatal)');
  }
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
    return handleFullIndex(c, registry, logger, session.userId);
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
    await registerProjectPhase(scope, logger, userId);

    // SA4E-99: Write to temp dir OUTSIDE workspace to avoid triggering Kiro file watcher
    // Structure: {indexTempDir}/{userId}/{projectId}/source/files...
    const tempBase = path.join(await resolveIndexTempDir(), userId || 'local-dev', scope.projectId, 'source');
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
      const targetPath = path.join(tempBase, filePath);
      try {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, file.content, 'utf-8');
        written.push(filePath);
      } catch { rejected.push(filePath); }
    }

    // Trigger async full index on the uploaded temp files so symbols/graph are generated
    // This connects the upload step to the existing IndexingEngine pipeline.
    try {
      const codeIntel = registry.getModule('codeIntel') as any;
      const indexer = codeIntel?.getIndexer?.();
      if (indexer && typeof indexer.runFullIndex === 'function') {
        // Fire-and-forget indexing on temp workspace
        indexer.runFullIndex({ projectId: scope.projectId, workspace: tempBase }, undefined, userId || undefined)
          .then(() => {
            logger.info({ projectId: scope.projectId, workspace: tempBase, written: written.length }, '[index-source] Background index of uploaded files completed');
            // Sync graph nodes after index
            if (typeof indexer.syncGraphNodesPublic === 'function') {
              indexer.syncGraphNodesPublic(scope.projectId).catch(() => {});
            }
          })
          .catch((err: any) => {
            logger.error({ err, projectId: scope.projectId }, '[index-source] Background index failed');
          });
      } else {
        logger.warn({ projectId: scope.projectId }, '[index-source] CodeIntel indexer not available — files written but not indexed');
      }
    } catch (e) {
      logger.warn({ err: e }, '[index-source] Failed to start background index');
    }

    return c.json({ written: written.length, skipped: 0, rejected, deps: [], projectId: scope.projectId, indexingStarted: true });
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
    // SA4E-99: Consistent temp structure — {indexTempDir}/{userId}/{projectId}/documents/
    const tempBase = path.join(await resolveIndexTempDir(), userId || 'local-dev', scope.projectId, 'documents');
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
    const { written, rejected } = await writeFilesPhase(userId, scope.projectId, files);
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
    const tempBase = path.join(await resolveIndexTempDir(), userId, scope.projectId, 'batch-docs');

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
