/**
 * Source/document indexing endpoints — POST /api/index/source|document|documents.
 * SA4E-41: every write is path-safe (SEC-04/05) and tenant-scoped (requireProjectId).
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Logger } from 'pino';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { loadConfig } from '../../config/index.js';
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

/**
 * SA4E-300 GAP 1: Sanitize a single path segment (userId/projectId) before
 * joining it into a filesystem path. Strips every char outside [A-Za-z0-9._-];
 * falls back when the result is empty or '.'/'..'.
 */
export function sanitizePathSegment(segment: string | undefined, fallback: string): string {
  const cleaned = (segment ?? '').replace(/[^A-Za-z0-9._-]/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') return fallback;
  return cleaned;
}

/**
 * SA4E-300 GAP 1: Cross-platform temp base — prefers config.indexTempDir
 * (CODE_INTEL_INDEX_TEMP_DIR or os.tmpdir()/CodeIntel), keeps the
 * {userId}/{projectId}/{subdir} structure with sanitized segments.
 */
export function resolveIndexTempBase(
  userId: string | undefined,
  projectId: string | undefined,
  subdir: string,
): string {
  let base: string | undefined;
  try {
    base = loadConfig().indexTempDir;
  } catch {
    base = undefined;
  }
  if (!base) base = process.env.CODE_INTEL_INDEX_TEMP_DIR || path.join(os.tmpdir(), 'CodeIntel');
  const safeUser = sanitizePathSegment(userId, 'local-dev');
  const safeProject = sanitizePathSegment(projectId, 'default');
  return path.join(base, safeUser, safeProject, subdir);
}

/**
 * SA4E-300 GAP 1: Resolve a client-supplied relative path safely under tempBase.
 * Returns the absolute target path, or null when the input is unsafe/escaping.
 * Catches absolute, '..' traversal (incl. backslash + percent-encoded), drive
 * letters, null bytes, and verifies path.relative stays inside tempBase.
 */
export function resolveSafeTargetPath(tempBase: string, rawPath: string): string | null {
  if (!rawPath || typeof rawPath !== 'string') return null;
  if (rawPath.includes('\0')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    decoded = rawPath;
  }
  // Reject Windows drive-absolute on any platform (C:\, C:/)
  if (/^[A-Za-z]:[/\\]/.test(decoded) || /^[A-Za-z]:[/\\]/.test(rawPath)) return null;
  if (/^[/\\]/.test(decoded) || /^[/\\]/.test(rawPath)) return null;
  const normalized = path.normalize(decoded);
  if (path.isAbsolute(normalized)) return null;
  const normalizedRaw = path.normalize(rawPath);
  if (path.isAbsolute(normalizedRaw)) return null;
  if (normalized.split(/[/\\]/).includes('..')) return null;
  if (normalizedRaw.split(/[/\\]/).includes('..')) return null;
  if (decoded.split(/[/\\]/).includes('..')) return null;
  const targetPath = path.join(tempBase, normalized);
  const rel = path.relative(tempBase, targetPath);
  if (!rel) return null;
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || rel.startsWith('../') || rel.startsWith('..\\')) return null;
  if (path.isAbsolute(rel)) return null;
  return targetPath;
}

/** Phase: write files to disk under the workspace, rejecting unsafe paths. */
function writeFilesPhase(userId: string, projectId: string, files: SourceFile[]): { written: number; rejected: string[]; rejectedReasons: { file: string; code: string; message: string }[] } {
  const rejected: string[] = [];
  const rejectedReasons: { file: string; code: string; message: string }[] = [];
  let written = 0;
  // SA4E-300 GAP 1: cross-platform temp base Temp/{userId}/{projectId}/batch-docs/
  const tempBase = resolveIndexTempBase(userId, projectId, 'batch-docs');
  fs.mkdirSync(tempBase, { recursive: true });
  for (const file of files) {
    const targetPath = resolveSafeTargetPath(tempBase, file.path);
    if (!targetPath) {
      rejected.push(file.path);
      rejectedReasons.push({ file: file.path, code: 'EACCES', message: 'Unsafe path: must be a relative path staying within the temp directory' });
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, file.content, 'utf-8');
      written++;
    } catch (err: any) {
      rejected.push(file.path);
      rejectedReasons.push({
        file: file.path,
        code: err?.code || 'UNKNOWN',
        message: err?.message || String(err)
      });
    }
  }
  return { written, rejected, rejectedReasons };
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
    if (!session) return c.json({ error: 'Unauthorized', details: 'Missing or invalid Authorization header', action: 'Provide valid Bearer token' }, 401);
    // SA4E-99: Backpressure — reject with 429 if too many concurrent requests
    if (activeIndexRequests >= INDEX_CONCURRENCY_LIMIT) {
      return c.json({ error: 'Server busy', details: `Active index requests >= ${INDEX_CONCURRENCY_LIMIT}`, action: 'Retry after 2 seconds', retryAfter: 2 }, 429);
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
    return handleSyncPegaRules(c, registry, logger);
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

async function handleIndexSource(c: Context, registry: ModuleRegistry, logger: Logger, userId = '') {
  try {
    const body = await c.req.json() as { files: SourceFile[] };
    const { files } = body;
    if (!files || !Array.isArray(files)) return c.json({ error: 'files array required', details: 'Request body must contain files array', action: 'Provide files array in request body' }, 400);
    const scope = resolveRequestScope(c);

    // SA4E-300 GAP 1: Write to temp dir OUTSIDE workspace to avoid triggering Kiro file watcher
    // Structure: {indexTempDir}/{userId}/{projectId}/source/files...
    const tempBase = resolveIndexTempBase(userId, scope.projectId, 'source');
    const wsBasename = path.basename(scope.workspace);
    fs.mkdirSync(tempBase, { recursive: true });

    const written: string[] = [];
    const rejected: string[] = [];
    const rejectedReasons: { file: string; code: string; message: string }[] = [];

    for (const file of files) {
      let filePath = file.path;
      // Strip workspace prefix if present
      if (filePath.startsWith(wsBasename + '/') || filePath.startsWith(wsBasename + '\\')) {
        filePath = filePath.substring(wsBasename.length + 1);
      }
      const targetPath = resolveSafeTargetPath(tempBase, filePath);
      if (!targetPath) {
        rejected.push(filePath);
        rejectedReasons.push({ file: filePath, code: 'EACCES', message: 'Unsafe path: must be a relative path staying within the temp directory' });
        continue;
      }
      try {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, file.content, 'utf-8');
        written.push(filePath);
      } catch (err: any) {
        rejected.push(filePath);
        rejectedReasons.push({
          file: filePath,
          code: err?.code || 'UNKNOWN',
          message: err?.message || String(err)
        });
      }
    }

    if (rejectedReasons.length > 0) {
      logger.warn({ rejectedReasons, projectId: scope.projectId }, '[index] rejected files');
    }

    return c.json({ written: written.length, skipped: 0, rejected, rejectedReasons, deps: [], projectId: scope.projectId });
  } catch (err: any) {
    return indexError(c, err, logger, 'Error processing source batch');
  }
}

async function handleIndexDocument(c: Context, logger: Logger, userId = '') {
  try {
    const body = await c.req.json() as { path: string; content: string };
    const { path: relPath, content } = body;
    if (!relPath || !content) return c.json({ error: 'path and content required', details: 'Both path and content must be provided', action: 'Include path and content in request body' }, 400);
    const scope = resolveRequestScope(c);
    // SA4E-300 GAP 1: Consistent temp structure — {indexTempDir}/{userId}/{projectId}/documents/
    const tempBase = resolveIndexTempBase(userId, scope.projectId, 'documents');
    const wsBasename = path.basename(scope.workspace);
    let filePath = relPath;
    if (filePath.startsWith(wsBasename + '/') || filePath.startsWith(wsBasename + '\\')) {
      filePath = filePath.substring(wsBasename.length + 1);
    }
    const targetPath = resolveSafeTargetPath(tempBase, filePath);
    if (!targetPath) {
      return c.json({ error: 'Unsafe path', details: 'Path must be a relative path staying within the temp directory (no absolute paths or .. traversal)', action: 'Provide safe relative path' }, 400);
    }
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
    if (!files || !Array.isArray(files)) return c.json({ error: 'files array required', details: 'Request body must contain files array', action: 'Provide files array in request body' }, 400);
    const scope = resolveRequestScope(c);
    const { written, rejected, rejectedReasons } = writeFilesPhase(userId, scope.projectId, files);
    if (rejectedReasons.length > 0) {
      logger.warn({ rejectedReasons, projectId: scope.projectId }, '[index] rejected unsafe paths');
    }
    return c.json({ indexed: written, rejected, rejectedReasons });
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
    // SA4E-300 GAP 1: sanitized cross-platform base {indexTempDir}/{userId}/{projectId}/batch-docs/
    const tempBase = resolveIndexTempBase(userId, scope.projectId, 'batch-docs');

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
      return c.json({ error: 'Memory module not ready', details: 'Memory service is initializing', action: 'Retry after a short delay' }, 503);
    }
    const dispatcher = mem.getDispatcher();
    let ingested = 0;
    let errors = 0;
    const failedFiles: { file: string; reason: string }[] = [];

    for (const filePath of files) {
      const relPath = path.relative(tempBase, filePath).replace(/\\/g, '/');
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        await dispatcher.dispatch('mem_ingest_file', {
          file_path: filePath,
          content_base64: Buffer.from(content, 'utf-8').toString('base64'),
          type: 'CONTEXT',
          scope: 'PROJECT',
        });
        ingested++;
      } catch (err: any) {
        errors++;
        const reason = err?.message || String(err);
        failedFiles.push({ file: relPath, reason });
        logger.warn({ err, file: relPath }, '[ingest-docs] Failed to ingest document');
      }
    }

    logger.info({ ingested, errors, total: files.length }, '[ingest-docs] Document ingest complete');
    return c.json({ ingested, errors, total: files.length, failedFiles });
  } catch (err: any) {
    return indexError(c, err, logger, 'Error ingesting documents from Temp');
  }
}

/** SA4E-209: Trigger async Pega rules sync — returns 202 immediately, runs in background. */
async function handleSyncPegaRules(c: Context, registry: ModuleRegistry, logger: Logger) {
  try {
    const body = await c.req.json<{ projectId?: string }>();
    if (!body.projectId) {
      // SA4E-300 GAP 2: full {error, details, action} shape (keep 400)
      return c.json({ error: 'projectId is required', details: 'Request body must contain a non-empty projectId field', action: 'Include projectId in request body' }, 400);
    }
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

/** Map errors to responses — PROJECT_REQUIRED → 400, everything else → 500. */
export function indexError(c: Context, err: any, logger: Logger, context: string) {
  if (String(err?.message).startsWith('PROJECT_REQUIRED')) {
    const details = String(err?.message).slice(0,2000);
    return c.json({ error: 'X-Project-Id required for indexing', details, action: 'Provide X-Project-Id header' }, 400);
  }
  let details = err?.message ? String(err.message) : String(err);
  if (details.length > 2000) details = details.slice(0,2000);
  const code = err?.code ? String(err.code) : undefined;
  let errorMsg = 'Internal error';
  let action = 'Retry';
  if (code === 'ENOSPC') {
    errorMsg = 'Disk full';
    action = 'Free up disk space';
  } else if (code === 'EACCES') {
    errorMsg = 'Permission denied';
    action = 'Check file permissions';
  } else if (err?.status) {
    errorMsg = `Request failed with status ${err.status}`;
  }
  logger.error({ err, code, context }, context);
  return c.json({ error: errorMsg, details, action }, 500);
}
