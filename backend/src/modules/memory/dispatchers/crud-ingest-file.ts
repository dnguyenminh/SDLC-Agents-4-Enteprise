/** mem_ingest_file handler — file ingestion + stale cleanup + task creation (BR-18). */
import * as fs from 'fs';
import type { MemoryEngine } from '../engine/core.js';
import type { KBScope, ScopeContext } from '../models.js';
import type { ProjectContext } from '../ProjectContext.js';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { buildIngestFileDeleteClause, buildIngestFileStaleTaskDeleteClause } from '../IsolationLayer.js';
import { tierForType, resolvePath } from './helpers.js';
import { classifyFormat, normalizeExt } from '../ingest/FormatClassifier.js';
import type { ConvertToolResolver } from '../ingest/ConvertToolResolver.js';
import { PendingTaskRepository } from '../task-queue/PendingTaskRepository.js';
import { TaskType } from '../task-queue/models.js';
import { getDbAdapter } from '../../../admin/db/core.js';
import { EpochService } from '../evolution/EpochService.js';
import { loadFileMetadata } from '../../../engine/indexer/file-scanner.js';
import { extractAndInsertIngestEdges } from '../engine/edge-on-ingest.js';
import { upsertGraphNode, logger } from './crud-shared.js';

type Args = Record<string, unknown>;

export interface IngestFileResponse {
  status: 'ingested' | 'unconvertible';
  entries?: number;
  file?: string;
  reason?: string;
}

export function unconvertibleMessage(filePath: string, reason: string): string {
  return JSON.stringify({ status: 'unconvertible', file: filePath, reason } satisfies IngestFileResponse);
}

export async function handleIngestFile(
  engine: MemoryEngine,
  scopeCtx: ScopeContext | undefined,
  workspace: string,
  a: Args,
  resolver?: ConvertToolResolver,
  dbAdapter?: DatabaseAdapter,
  embeddingAvailable?: boolean,
): Promise<string> {
  const filePath = a.file_path as string;
  if (!filePath) return 'Error: file_path required';
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

type ReadOutcome = { ok: true; text: string } | { ok: false; response: string };

/** Resolve + read file content (markdown/text/base64/converter), or an early-return response. */
async function readFileContent(
  a: Args, filePath: string, workspace: string, resolver?: ConvertToolResolver,
): Promise<ReadOutcome> {
  const format = classifyFormat({ filePath });
  const providedContent = a.content as string | undefined;
  const contentBase64 = a.content_base64 as string | undefined;

  if (format === 'markdown' || format === 'text') {
    const text = contentBase64 ? Buffer.from(contentBase64, 'base64').toString('utf-8') : providedContent;
    if (!text) {
      const resolved = resolvePath(filePath, workspace);
      if (!fs.existsSync(resolved)) return { ok: false, response: `Error: file not found — ${resolved}` };
      return { ok: true, text: await fs.promises.readFile(resolved, 'utf-8') };
    }
    return { ok: true, text };
  } else if (contentBase64 && contentBase64.trim().length > 0) {
    return { ok: true, text: Buffer.from(contentBase64, 'base64').toString('utf-8') };
  } else if (providedContent && providedContent.trim().length > 0) {
    return { ok: true, text: providedContent };
  } else {
    const resolved = resolvePath(filePath, workspace);
    if (!fs.existsSync(resolved)) return { ok: false, response: unconvertibleMessage(filePath, 'no-tool') };
    if (!resolver) return { ok: false, response: unconvertibleMessage(filePath, 'no-tool') };
    const res = await resolver.resolve({ filePath: resolved, ext: normalizeExt(filePath) });
    if (!res.ok) return { ok: false, response: unconvertibleMessage(filePath, res.reason) };
    return { ok: true, text: res.markdown };
  }
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

async function deleteStaleGraphNodes(engine: MemoryEngine, filePath: string, projectId: string | null): Promise<void> {
  try {
    const adminAdapter = getDbAdapter();
    const oldIds = projectId === null
      ? await engine.getAdapter().allAsync<{ id: number }>(
          'SELECT id FROM knowledge_entries WHERE source = $1',
          [filePath],
        )
      : await engine.getAdapter().allAsync<{ id: number }>(
          'SELECT id FROM knowledge_entries WHERE source = $1 AND project_id = $2',
          [filePath, projectId],
        );
    if (oldIds.length > 0) {
      const idList = oldIds.map(r => `'doc-${r.id}'`).join(',');
      await adminAdapter.runAsync(`DELETE FROM graph_nodes WHERE entry_id IN (${idList})`, []);
    }
  } catch (err) { logger.debug({ err }, '[ingest-file] Failed to delete stale graph nodes (non-fatal)'); }
}
