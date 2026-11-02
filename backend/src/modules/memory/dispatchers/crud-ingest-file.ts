/** mem_ingest_file handler — file ingestion + stale cleanup + task creation (BR-18). */
import type { MemoryEngine } from '../engine/core.js';
import type { KBScope, ScopeContext } from '../models.js';
import type { ProjectContext } from '../ProjectContext.js';
import type { ConvertToolResolver } from '../ingest/ConvertToolResolver.js';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { buildIngestFileDeleteClause, buildIngestFileStaleTaskDeleteClause } from '../IsolationLayer.js';
import { tierForType, readFileContent, unconvertibleMessage, type IngestFileResponse } from './helpers.js';
import { PendingTaskRepository } from '../task-queue/PendingTaskRepository.js';
import { TaskType } from '../task-queue/models.js';
import { EpochService } from '../evolution/EpochService.js';
import { loadFileMetadata } from '../../../engine/indexer/file-scanner.js';
import { extractAndInsertIngestEdges } from '../engine/edge-on-ingest.js';
import { upsertGraphNode, logger } from './crud-shared.js';
import { deleteStaleGraphNodes } from './graph-node-cleanup.js';
import {
  hasBaseDirArg,
  type MultiWorktreePathResolver,
} from '../../../shared/multi-worktree-path-resolver.js';
import { getSharedPathResolver } from '../../../shared/path-resolver-provider.js';
import { resolveLegacyRead } from '../../../shared/legacy-path-gate.js';

type Args = Record<string, unknown>;

export async function handleIngestFile(
  engine: MemoryEngine,
  scopeCtx: ScopeContext | undefined,
  workspace: string,
  a: Args,
  resolver?: ConvertToolResolver,
  dbAdapter?: DatabaseAdapter,
  embeddingAvailable?: boolean,
  pathResolver?: MultiWorktreePathResolver,
): Promise<string> {
  let filePath = a.file_path as string;
  if (!filePath) return 'Error: file_path required';
  // SA4E-394 — base_dir/workspace_root present → resolve the ingest source via
  // the shared resolver BEFORE any read/dedup (BR-02/05/07); omitted → legacy.
  if (hasBaseDirArg(a)) {
    const resolution = (pathResolver ?? getSharedPathResolver(logger)).resolve({
      filePath, baseDir: a.base_dir, workspaceRoot: a.workspace_root,
    });
    if (!resolution.ok) return `Error: ${resolution.message}`;
    filePath = resolution.resolvedPath;
  } else {
    // SEC-01 — legacy (base_dir omitted) reads stay contained (C-3 pinned
    // workspace root + allowlist roots); rejections reuse the base_dir typed
    // error verbatim (BR-23 — zero side effects). `filePath` (the KB `source`
    // key) is intentionally NOT rewritten on the legacy branch.
    const gate = resolveLegacyRead({
      pinnedRoot: workspace,
      allowlistRoots: (pathResolver ?? getSharedPathResolver(logger)).allowlistRoots(),
      filePath,
    });
    if (!gate.ok) return `Error: ${gate.message}`;
  }
  const type = (a.type as string) ?? 'CONTEXT';
  const scope = ((a.scope as string) ?? 'PROJECT').toUpperCase() as KBScope;
  const userId = (a.user_id as string) ?? scopeCtx?.userId ?? null;

  const content = await readFileContent(a, filePath, workspace, resolver);
  if (!content.ok) return content.response;
  const text = content.text;

  await deleteStaleIngestFileData(engine, scopeCtx, filePath);

  // SA4E-53: PostgreSQL rejects null bytes (0x00) in text columns
  const cleanText = text.split('\x00').join('');

  const sections = cleanText.split(/^#{1,3}\s+/m).filter(s => s.trim());
  const fileMeta = loadFileMetadata(workspace);
  const meta = fileMeta[filePath.replace(/\\/g, '/')];
  const structuredMap = meta ? JSON.stringify({ fileCreatedAt: meta.fileCreatedAt, fileAuthor: meta.fileAuthor, fileVersion: meta.fileVersion }) : undefined;
  const taskRepo = dbAdapter ? new PendingTaskRepository(dbAdapter) : undefined;

  // SA4E-337 F1: caller-supplied path tags (buildIngestFileArgs → extractTagsFromPath)
  // must reach the DB. Previously hardcoded '' in the insert below, so the tags
  // computed by the ingest-docs route never persisted end-to-end.
  const tags = Array.isArray(a.tags) ? (a.tags as string[]).join(',') : ((a.tags as string) ?? '');

  // SA4E-163 design: UNIQUE(source, project_id) + UPSERT means ONE row per file
  // holds the FULL document content (section chunks would collapse onto the same
  // source anyway). Summary comes from the first section heading.
  const summary = (sections[0] ?? cleanText).split('\n')[0]?.trim().slice(0, 120) || filePath;
  const id = await engine.insert({
    content: cleanText, summary, type, tier: tierForType(type), scope,
    user_id: userId, project_id: scopeCtx?.projectId ?? null, source: filePath, tags,
  });
  // NEW-01: Mark as pending — TAG_ENRICHMENT task will process later
  try {
    await engine.getAdapter().runAsync(
      `UPDATE knowledge_entries SET enrichment_status = 'pending' WHERE id = ?`,
      [id],
    );
  } catch (err) { logger.debug({ err }, '[ingest-file] Failed to set enrichment_status (column may not exist pre-migration)'); }
  if (structuredMap) {
    await engine.updateStructuredMap(id, structuredMap);
  }
  if (taskRepo) {
    // SA4E-337 F1: `source` drives fallbackTagExtraction path tags (LLM-down path);
    // `existing_tags` seeds the dedup merge instead of always starting from ''.
    await taskRepo.create({ task_type: TaskType.TAG_ENRICHMENT, entry_id: id, payload: { entry_id: id, content: cleanText, existing_tags: tags, source: filePath, options: { threshold: 0.6, autoApply: true } } });
    if (embeddingAvailable) {
      await taskRepo.create({ task_type: TaskType.VECTOR_EMBEDDING, entry_id: id, payload: { entry_id: id, text: `${summary} ${cleanText}`.slice(0, 4000) } });
    }
  }
  await upsertGraphNode(id, summary, type, scopeCtx?.projectId ?? null);
  try {
    await extractAndInsertIngestEdges(engine.getAdapter(), {
      entryId: id,
      content: cleanText,
      source: filePath,
      tags,
      type,
      projectId: scopeCtx?.projectId ?? null,
    });
  } catch (err) {
    logger.warn({ err }, '[edge-on-ingest] Non-blocking edge extraction failed for file ingest');
  }
  await engine.auditLog('INGEST_FILE');

  if (sections.length > 5) {
    const epochSvc = new EpochService(engine.getAdapter(), logger);
    const epochId = `epoch-ingest-${Date.now()}`;
    epochSvc.trigger('BULK_INGEST', epochId).catch(() => {});
  }

  return JSON.stringify({ status: 'ingested', entries: 1, file: filePath } satisfies IngestFileResponse);
}

/**
 * Delete stale KB entries + graph nodes + pending tasks for a re-ingested file.
 * Graph nodes are removed BEFORE entries (while IDs still exist); pending_tasks
 * rows are removed BEFORE entries because pending_tasks.entry_id FK (migration 003)
 * has no ON DELETE CASCADE (D3 follow-up — re-ingest would otherwise fail with
 * SQLITE_CONSTRAINT_FOREIGNKEY).
 */
async function deleteStaleIngestFileData(engine: MemoryEngine, scopeCtx: ScopeContext | undefined, filePath: string): Promise<void> {
  if (scopeCtx) {
    const { clause, params } = buildIngestFileDeleteClause(scopeCtx as ProjectContext, filePath);
    await deleteStaleGraphNodes(engine, filePath, (scopeCtx as any).projectId ?? '');
    try {
      const staleTasks = buildIngestFileStaleTaskDeleteClause(scopeCtx as ProjectContext, filePath);
      await engine.getAdapter().runAsync(staleTasks.clause, staleTasks.params);
    } catch (err) { logger.debug({ err }, '[ingest-file] Failed to delete stale pending tasks (non-fatal)'); }
    await engine.getAdapter().runAsync(clause, params);
  } else {
    await deleteStaleGraphNodes(engine, filePath, null);
    try {
      const staleTasks = buildIngestFileStaleTaskDeleteClause(undefined, filePath);
      await engine.getAdapter().runAsync(staleTasks.clause, staleTasks.params);
    } catch (err) { logger.debug({ err }, '[ingest-file] Failed to delete stale pending tasks (non-fatal)'); }
    await engine.getAdapter().runAsync('DELETE FROM knowledge_entries WHERE source = ?', [filePath]);
  }
}
