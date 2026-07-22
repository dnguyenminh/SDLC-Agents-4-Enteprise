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

interface SourceFile { path: string; content: string }
interface IndexScope { projectId: string; workspace: string }

/** Resolve request scope from trusted headers, falling back to boot config. */
function resolveRequestScope(c: Context): IndexScope {
  const config = loadConfig();
  const projectId = requireProjectId(c.req.header('X-Project-Id') || config.projectId);
  const workspace = c.req.header('X-Workspace-Root') || config.workspace;
  return { projectId, workspace };
}

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

/** Phase: register/update the project in the admin registry (non-fatal). */
async function registerProjectPhase(projectId: string, workspace: string, logger: Logger): Promise<void> {
  try {
    const graphRepo = new GraphRepository(getAdminAdapter());
    await graphRepo.registerProject(projectId, path.basename(workspace), workspace);
  } catch (err) {
    logger.warn({ err, projectId }, '[index] project registry upsert skipped (non-fatal)');
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

/** Phase: ensure a KB metadata entry + graph node exist for the project (non-fatal). */
/** Phase: ensure a KB metadata entry + graph node exist for the project (non-fatal). */
async function ensureProjectKbEntry(registry: ModuleRegistry, scope: IndexScope, written: number, logger: Logger): Promise<void> {
  try {
    const mem = registry.getModule('memory') as any;
    if (mem?.status !== 'ready') return;
    const engine = mem.getEngine();
    const displayName = path.basename(scope.workspace);
    // Use async insert — engine.insert() is now async for PostgreSQL compatibility
    const entryId = await engine.insert({
      content: `Project "${displayName}" indexed. Workspace: ${scope.workspace}. Files: ${written}.`,
      summary: `Project metadata for ${displayName}`,
      type: 'CONTEXT', tier: 'SEMANTIC', scope: 'PROJECT',
      project_id: scope.projectId, source: 'project-metadata', tags: 'project,metadata,indexed',
    });
    await upsertProjectGraphNode(String(entryId), displayName, scope.projectId, logger);
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
      tier: 'SEMANTIC', projectId, x: 0, y: 0, z: 0, level: 'macro', clusterId: '0',
    });
  } catch (err) {
    logger.warn({ err }, '[index] graph node upsert skipped (non-fatal)');
  }
}

/** Register the /api/index/* routes on the given app. */
export function registerIndexRoutes(app: Hono, registry: ModuleRegistry, logger: Logger): void {
  app.post('/api/index/source', (c) => handleIndexSource(c, registry, logger));
  app.post('/api/index/document', (c) => handleIndexDocument(c, logger));
  app.post('/api/index/documents', (c) => handleIndexDocuments(c, logger));
}

async function handleIndexSource(c: Context, registry: ModuleRegistry, logger: Logger) {
  try {
    const { files } = await c.req.json<{ files: SourceFile[] }>();
    if (!files || !Array.isArray(files)) return c.json({ error: 'files array required' }, 400);
    const scope = resolveRequestScope(c);
    await registerProjectPhase(scope.projectId, scope.workspace, logger);
    const { written, rejected } = writeFilesPhase(scope.workspace, files);
    if (rejected.length > 0) logger.warn({ rejected, projectId: scope.projectId }, '[index] rejected unsafe paths');
    const reindexTriggered = triggerIndexPhase(registry, scope, logger);
    await ensureProjectKbEntry(registry, scope, written, logger);
    return c.json({ written, rejected, reindexTriggered, projectId: scope.projectId });
  } catch (err: any) {
    return indexError(c, err, logger, 'Error writing source batch');
  }
}

async function handleIndexDocument(c: Context, logger: Logger) {
  try {
    const { path: relPath, content } = await c.req.json<{ path: string; content: string }>();
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
    const { files } = await c.req.json<{ files: SourceFile[] }>();
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

