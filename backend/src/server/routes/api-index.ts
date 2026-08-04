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
import { getAdminAdapter } from '../../admin/db/core.js';
import { GraphRepository } from '../../database/repositories/GraphRepository.js';
import { requireProjectId } from '../../engine/query/code-intel-isolation.js';
import { resolveWithinWorkspace } from '../../shared/path-safety.js';
import { validateSession } from '../../admin/db/sessions.js';
import type { FileDependency } from '../../engine/parsers/types.js';
import {
  handleFullIndex, handleFileEvents, handleCancel, handleProgress,
} from './api-index-decoupled.js';

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

/**
 * Resolve request scope. Both paths are computed here:
 *   1. `workspace` — server-side FS path used for indexing/writes.
 *   2. `clientWorkspaceRoot` — original client host path, stored verbatim in
 *      DB metadata so displays and graph labels use the user's own path (not
 *      the internal `/app/workspaces/<projectId>/...` layout).
 */
function resolveRequestScope(c: Context): IndexScope {
  const config = loadConfig();
  const projectId = requireProjectId(c.req.header('X-Project-Id') || config.projectId);
  const clientPath = c.req.header('X-Workspace-Root');
  const safeProjectDir = path.resolve(resolveServerWorkspacesRoot(), sanitizeProjectIdForFs(projectId));

  const workspace = clientPath
    ? mapClientPathToContainer(clientPath, projectId)
    : safeProjectDir;
  fs.mkdirSync(workspace, { recursive: true });

  // `clientWorkspaceRoot` reflects what the user sent; fall back to the
  // stable projectId marker so downstream code always has *something*.
  const clientWorkspaceRoot = clientPath ?? projectId;
  const displayName = (clientPath && basenameFromClientPath(clientPath)) || projectId;

  return { projectId, workspace, clientWorkspaceRoot, displayName };
}

/** Extract userId from Bearer token (non-fatal — returns '' if unauthenticated). */
// NOTE: resolveUserId kept for backward compatibility but auth is now enforced at route level

/** Phase: write files to disk under the workspace, rejecting unsafe paths. */
function writeFilesPhase(workspace: string, files: SourceFile[]): { written: number; rejected: string[] } {
  const rejected: string[] = [];
  let written = 0;
  for (const file of files) {
    const targetPath = resolveWithinWorkspace(workspace, file.path);
    if (!targetPath) { rejected.push(file.path); continue; }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, file.content, 'utf-8');
    written++;
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
    const graphRepo = new GraphRepository(getAdminAdapter());
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

/**
 * Phase: ensure a KB metadata entry + graph node exist for the project (non-fatal).
 * The KB content records the user's ORIGINAL host workspace path so semantic
 * search / display references match what the user knows.
 */
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
    const graphRepo = new GraphRepository(getAdminAdapter());
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
    return handleIndexSource(c, registry, logger, session.userId);
  });
  app.post('/api/index/document', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleIndexDocument(c, logger);
  });
  app.post('/api/index/documents', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleIndexDocuments(c, logger);
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
    const codeIntel = registry.getModule('codeIntel') as CodeIntelModule | undefined;
    const indexer = codeIntel?.getIndexer() as any;

    const written: string[] = [];
    const skipped: string[] = [];
    const rejected: string[] = [];
    const allDeps: FileDependency[] = [];

    for (const file of files) {
      const targetPath = resolveWithinWorkspace(scope.workspace, file.path);
      if (!targetPath) { rejected.push(file.path); continue; }

      const fileHash = file.gitHash || file.checksum || '';

      if (indexer && fileHash) {
        try {
          const existing = await indexer.adapter.getAsync(
            'SELECT content_hash FROM files WHERE relative_path = ? AND project_id = ?',
            [file.path, scope.projectId],
          ) as { content_hash: string } | undefined;
          if (existing && existing.content_hash === fileHash.slice(0, 16)) {
            skipped.push(file.path);
            continue;
          }
        } catch {
          // Table may not exist yet — proceed with indexing
        }
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, file.content, 'utf-8');
      written.push(file.path);

      // Index single file and collect deps
      if (indexer) {
        try {
          const result = await indexer.indexSingleFile(file.path, scope.projectId);
          if (result && result.dependencies) {
            for (const dep of result.dependencies) {
              if (!allDeps.some(d => d.path === dep.path)) {
                allDeps.push(dep);
              }
            }
          }
        } catch (err) {
          logger.warn({ err, file: file.path }, '[index] single-file index failed (non-fatal)');
        }
      }
    }

    if (rejected.length > 0) logger.warn({ rejected, projectId: scope.projectId }, '[index] rejected unsafe paths');
    await ensureProjectKbEntry(registry, scope, written.length, logger);
    return c.json({ written: written.length, skipped: skipped.length, rejected, deps: allDeps, projectId: scope.projectId });
  } catch (err: any) {
    return indexError(c, err, logger, 'Error writing source batch');
  }
}

async function handleIndexDocument(c: Context, logger: Logger) {
  try {
    const body = await c.req.json() as { path: string; content: string };
    const { path: relPath, content } = body;
    if (!relPath || !content) return c.json({ error: 'path and content required' }, 400);
    const scope = resolveRequestScope(c);
    const targetPath = resolveWithinWorkspace(scope.workspace, relPath);
    if (!targetPath) return c.json({ error: 'Invalid path' }, 400);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf-8');
    return c.json({ success: true });
  } catch (err: any) {
    return indexError(c, err, logger, 'Error writing document');
  }
}

async function handleIndexDocuments(c: Context, logger: Logger) {
  try {
    const body = await c.req.json() as { files: SourceFile[] };
    const { files } = body;
    if (!files || !Array.isArray(files)) return c.json({ error: 'files array required' }, 400);
    const scope = resolveRequestScope(c);
    const { written, rejected } = writeFilesPhase(scope.workspace, files);
    if (rejected.length > 0) logger.warn({ rejected, projectId: scope.projectId }, '[index] rejected unsafe paths');
    return c.json({ indexed: written, rejected });
  } catch (err: any) {
    return indexError(c, err, logger, 'Error writing documents batch');
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

