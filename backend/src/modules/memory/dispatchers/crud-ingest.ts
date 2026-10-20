/** mem_ingest handler — KB entry insert + task creation + edge extraction (BR-18). */
import type { MemoryEngine } from '../engine/core.js';
import type { KBScope, ScopeContext } from '../models.js';
import type { TagAnalyzerService } from '../llm/analyzer.js';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { tierForType, inferOwner } from './helpers.js';
import { createSupersessionChain } from './supersession.js';
import { PendingTaskRepository } from '../task-queue/PendingTaskRepository.js';
import { TaskType } from '../task-queue/models.js';
import { extractAndInsertIngestEdges } from '../engine/edge-on-ingest.js';
import { upsertGraphNode, logger } from './crud-shared.js';

type Args = Record<string, unknown>;

/**
 * SA4E-44: handleIngest accepts optional DatabaseAdapter for transactional task creation.
 * Falls back to fire-and-forget when adapter is not provided (backward compat).
 */
export async function handleIngest(
  engine: MemoryEngine,
  scopeCtx: ScopeContext | undefined,
  tagAnalyzer: TagAnalyzerService | undefined,
  a: Args,
  dbAdapter?: DatabaseAdapter,
  embeddingAvailable?: boolean,
): Promise<string> {
  let content = a.content as string;
  if (!content) return 'Error: content required';
  // SA4E-53: PostgreSQL rejects null bytes in text columns
  content = content.split('\x00').join('');
  const type = (a.type as string) ?? 'CONTEXT';
  const source = a.source as string | undefined;
  const tags = Array.isArray(a.tags) ? (a.tags as string[]).join(',') : ((a.tags as string) ?? '');
  const summary = (a.summary as string) ?? (a.title as string) ?? content.slice(0, 120);
  const agentName = a.agent_name as string | undefined;
  const scope = ((a.scope as string) ?? 'PROJECT').toUpperCase() as KBScope;
  const userId = (a.user_id as string) ?? scopeCtx?.userId ?? null;

  let id!: number;

  if (dbAdapter) {
    id = await insertWithTasks(engine, dbAdapter, { content, summary, type, scope, userId, projectId: scopeCtx?.projectId ?? null, source, tags, agentName }, embeddingAvailable);
  } else {
    id = await insertWithoutTasks(engine, tagAnalyzer, { content, summary, type, scope, userId, projectId: scopeCtx?.projectId ?? null, source, tags, agentName });
  }

  await engine.auditLog('INGEST', id);
  await upsertGraphNode(id, summary, type, scopeCtx?.projectId ?? null);
  await extractIngestEdges(engine, id, content, source, tags, type, scopeCtx?.projectId ?? null);

  const supersedesId = a.supersedes_id as number | undefined;
  if (supersedesId) {
    const chainResult = await createSupersessionChain(engine, id, supersedesId);
    if (!chainResult.ok) {
      return `Knowledge entry created: id=${id} — supersession failed: ${chainResult.reason}`;
    }
  }

  return `Knowledge entry created: id=${id}, type=${type}, scope=${scope}, tier=${tierForType(type)} - "${summary}"`;
}

interface IngestFields {
  content: string; summary: string; type: string; scope: KBScope;
  userId: string | null; projectId: string | null; source: string | undefined; tags: string; agentName: string | undefined;
}

/** SA4E-107: insert + task creation WITHOUT transaction wrapper (pool-poisoning root cause). */
async function insertWithTasks(
  engine: MemoryEngine, dbAdapter: DatabaseAdapter, f: IngestFields, embeddingAvailable?: boolean,
): Promise<number> {
  const id = await engine.insert({
    content: f.content, summary: f.summary, type: f.type,
    tier: tierForType(f.type), scope: f.scope, user_id: f.userId,
    project_id: f.projectId, source: f.source, tags: f.tags, agent_name: f.agentName,
    owner: inferOwner(f.source),
  });
  const taskRepo = new PendingTaskRepository(dbAdapter);
  // SA4E-337 F1: payload MUST carry `source` — TaskWorker.fallbackTagExtraction
  // derives path tags (sa4e/ticket/doc-type) from payload.source when LLM is down.
  await taskRepo.create({ task_type: TaskType.TAG_ENRICHMENT, entry_id: id, payload: { entry_id: id, content: f.content, existing_tags: f.tags, source: f.source ?? null, options: { threshold: 0.6, autoApply: true } } });
  if (embeddingAvailable) {
    await taskRepo.create({ task_type: TaskType.VECTOR_EMBEDDING, entry_id: id, payload: { entry_id: id, text: `${f.summary} ${f.content}`.slice(0, 4000) } });
  }
  // Set enrichment_status (non-fatal if column missing)
  try {
    await dbAdapter.runAsync(
      `UPDATE knowledge_entries SET enrichment_status = 'pending' WHERE id = ?`,
      [id],
    );
  } catch (err) { logger.debug({ err }, '[ingest] Failed to set enrichment_status (non-fatal)'); }
  return id;
}

/** No-adapter path: best-effort enrichment_status + fire-and-forget LLM tag analysis (TA-11). */
async function insertWithoutTasks(
  engine: MemoryEngine, tagAnalyzer: TagAnalyzerService | undefined, f: IngestFields,
): Promise<number> {
  const id = await engine.insert({
    content: f.content, summary: f.summary, type: f.type,
    tier: tierForType(f.type), scope: f.scope, user_id: f.userId,
    project_id: f.projectId, source: f.source, tags: f.tags, agent_name: f.agentName,
    owner: inferOwner(f.source),
  });
  if (!tagAnalyzer) {
    try {
      await engine.getAdapter().runAsync(
        `UPDATE knowledge_entries SET enrichment_status = 'pending' WHERE id = ?`,
        [id],
      );
    } catch (err) { logger.debug({ err }, '[ingest] Failed to set enrichment_status (non-fatal — graceful degradation)'); }
  }
  if (tagAnalyzer) {
    tagAnalyzer.analyzeTags(f.content).then(async result => {
      if (result.appliedTags.length > 0) {
        const existing = f.tags ? f.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        const merged = [...new Set([...existing, ...result.appliedTags])];
        await engine.updateTags(id, merged.join(','));
      }
    }).catch((err) => { logger.error({ err }, '[TagAnalyzer] LLM analysis failed:'); });
  }
  return id;
}

/** SA4E-250: Edge extraction runs after node upsert (non-blocking). */
async function extractIngestEdges(
  engine: MemoryEngine, id: number, content: string, source: string | undefined,
  tags: string, type: string, projectId: string | null,
): Promise<void> {
  try {
    await extractAndInsertIngestEdges(engine.getAdapter(), {
      entryId: id,
      content,
      source: source ?? null,
      tags,
      type,
      projectId,
    });
  } catch (err) {
    logger.warn({ err }, '[edge-on-ingest] Non-blocking edge extraction failed');
  }
}

export { upsertGraphNode };
