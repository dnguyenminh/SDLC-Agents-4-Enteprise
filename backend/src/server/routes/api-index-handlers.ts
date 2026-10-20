/**
 * Index request handlers (source/document batch writes) — extracted from api-index.ts (BR-18).
 * SA4E-41: every write is path-safe (SEC-04/05) and tenant-scoped (requireProjectId).
 */
import type { Context } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { loadConfig } from '../../config/index.js';
import { requireProjectId } from '../../engine/query/code-intel-isolation.js';
import type { SourceFile, IndexScope, RejectedReason } from './api-index-paths.js';
import { resolveIndexTempBase, resolveSafeTargetPath, writeFilesPhase } from './api-index-paths.js';
import { requireIndexPermission, verifyIndexProjectBinding } from './api-index-auth.js';

/**
 * Resolve request scope from the trusted request identity only.
 * The project identity MUST come from the client (X-Project-Id header). The backend
 * is multi-tenant and does NOT own a project — it must never infer identity from its
 * own filesystem/git/config. Missing identity → requireProjectId throws PROJECT_REQUIRED
 * (fail-closed), surfaced as 400 by the route error handler.
 */
export function resolveRequestScope(c: Context): IndexScope {
  const config = loadConfig();
  const projectId = requireProjectId(c.req.header('X-Project-Id'));
  // workspace is only a display/scan hint, not identity — boot config fallback is safe here.
  const workspace = c.req.header('X-Workspace-Root') || config.workspace;
  return { projectId, workspace };
}

export async function handleIndexSource(c: Context, registry: ModuleRegistry, logger: Logger, userId = '') {
  try {
    const body = await c.req.json() as { files: SourceFile[] };
    const { files } = body;
    if (!files || !Array.isArray(files)) return c.json({ error: 'files array required', details: 'Request body must contain files array', action: 'Provide files array in request body' }, 400);
    const scope = resolveRequestScope(c);
    // SA4E-300 SEC High #1 (BOLA): global write gate + tenant binding.
    const forbidden = await requireIndexPermission(c, userId, 'KB_WRITE', logger);
    if (forbidden) return forbidden;
    const bindingDenied = await verifyIndexProjectBinding(c, scope.projectId, logger);
    if (bindingDenied) return bindingDenied;

    // SA4E-300 GAP 1: Write to temp dir OUTSIDE workspace to avoid triggering Kiro file watcher
    // Structure: {indexTempDir}/{userId}/{projectId}/source/files...
    const tempBase = resolveIndexTempBase(userId, scope.projectId, 'source');
    const wsBasename = path.basename(scope.workspace);
    await fs.promises.mkdir(tempBase, { recursive: true });

    const written: string[] = [];
    const rejected: string[] = [];
    const rejectedReasons: RejectedReason[] = [];

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
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.promises.writeFile(targetPath, file.content, 'utf-8');
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

export async function handleIndexDocument(c: Context, logger: Logger, userId = '') {
  try {
    const body = await c.req.json() as { path: string; content: string };
    const { path: relPath, content } = body;
    if (!relPath || !content) return c.json({ error: 'path and content required', details: 'Both path and content must be provided', action: 'Include path and content in request body' }, 400);
    const scope = resolveRequestScope(c);
    // SA4E-300 SEC High #1 (BOLA): global write gate + tenant binding.
    const docForbidden = await requireIndexPermission(c, userId, 'KB_WRITE', logger);
    if (docForbidden) return docForbidden;
    const docBindingDenied = await verifyIndexProjectBinding(c, scope.projectId, logger);
    if (docBindingDenied) return docBindingDenied;
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
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, content, 'utf-8');
    return c.json({ success: true });
  } catch (err: any) {
    return indexError(c, err, logger, 'Error writing document');
  }
}

export async function handleIndexDocuments(c: Context, logger: Logger, userId = '') {
  try {
    const body = await c.req.json() as { files: SourceFile[] };
    const { files } = body;
    if (!files || !Array.isArray(files)) return c.json({ error: 'files array required', details: 'Request body must contain files array', action: 'Provide files array in request body' }, 400);
    const scope = resolveRequestScope(c);
    // SA4E-300 SEC High #1 (BOLA): global write gate + tenant binding.
    const docsForbidden = await requireIndexPermission(c, userId, 'KB_WRITE', logger);
    if (docsForbidden) return docsForbidden;
    const docsBindingDenied = await verifyIndexProjectBinding(c, scope.projectId, logger);
    if (docsBindingDenied) return docsBindingDenied;
    const { written, rejected, rejectedReasons } = await writeFilesPhase(userId, scope.projectId, files);
    if (rejectedReasons.length > 0) {
      logger.warn({ rejectedReasons, projectId: scope.projectId }, '[index] rejected unsafe paths');
    }
    return c.json({ indexed: written, rejected, rejectedReasons });
  } catch (err: any) {
    return indexError(c, err, logger, 'Error writing documents batch');
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
