/**
 * crud.ts — mem_ingest, mem_ingest_file, mem_pin, mem_map, mem_crud handlers.
 * OCP fix: handleCrud() uses an action registry map instead of switch.
 * Adding a new CRUD action only requires adding an entry to the registry.
 */
import * as fs from 'fs';
import type { MemoryEngine } from '../engine/core.js';
import type { KBScope, ScopeContext } from '../models.js';
import type { TagAnalyzerService } from '../llm/analyzer.js';
import type { ProjectContext } from '../ProjectContext.js';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { validateReadAccess, validateMutationOwnership, buildIngestFileDeleteClause } from '../IsolationLayer.js';
import { tierForType, inferOwner, resolvePath } from './helpers.js';
import { classifyFormat, normalizeExt } from '../ingest/FormatClassifier.js';
import type { ConvertToolResolver } from '../ingest/ConvertToolResolver.js';
import { createSupersessionChain } from './supersession.js';
import { PendingTaskRepository } from '../task-queue/PendingTaskRepository.js';
import { TaskType } from '../task-queue/models.js';
import { GraphRepository } from '../../../database/repositories/GraphRepository.js';
import { getAdminAdapter } from '../../../admin/db/core.js';
import { computePositionByIndex } from '../../kb-graph/service/nodes.js';
import pino from 'pino';
import { loadFileMetadata } from '../../../engine/scanner/file-scanner.js';

const logger = pino({ name: 'memory-tool-dispatcher' });

type Args = Record<string, unknown>;

/** Upsert a KB entry as a graph node (non-fatal — graph viz is secondary). */
async function upsertGraphNode(entryId: number, summary: string, type: string, projectId: string | null): Promise<void> {
  try {
    const graphRepo = new GraphRepository(getAdminAdapter());
    const nodeCount = await graphRepo.getNodeCounts(projectId || '');
    const pos = computePositionByIndex(nodeCount.total, nodeCount.total + 1, type, 0, 1);
    await graphRepo.upsertNode({
      entryId: `doc-${entryId}`, label: summary.substring(0, 60),
      type: type.toUpperCase(), tier: 'SHARED',
      projectId: projectId || '', x: pos.x, y: pos.y, z: pos.z,
      level: pos.level, clusterId: pos.clusterId,
    });
    logger.info({ entryId, type }, '[graph] Upserted graph node for KB entry');
  } catch (err: any) {
    logger.error({ err: err.message, entryId, type }, '[graph] Failed to upsert graph node');
  }
}

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
  content = content.replace(/\x00/g, '');
  const type = (a.type as string) ?? 'CONTEXT';
  const source = a.source as string | undefined;
  const tags = Array.isArray(a.tags) ? (a.tags as string[]).join(',') : ((a.tags as string) ?? '');
  const summary = (a.summary as string) ?? (a.title as string) ?? content.slice(0, 120);
  const agentName = a.agent_name as string | undefined;
  const scope = ((a.scope as string) ?? 'PROJECT').toUpperCase() as KBScope;
  const userId = (a.user_id as string) ?? scopeCtx?.userId ?? null;

  let id!: number;

  if (dbAdapter) {
    await dbAdapter.transactionAsync(async () => {
      id = await engine.insert({
        content, summary, type,
        tier: tierForType(type), scope, user_id: userId,
        project_id: scopeCtx?.projectId ?? null,
        source, tags, agent_name: agentName,
        owner: inferOwner(source),
      });
      const taskRepo = new PendingTaskRepository(dbAdapter);
      if (tagAnalyzer) {
        await taskRepo.create({ task_type: TaskType.TAG_ENRICHMENT, entry_id: id, payload: { entry_id: id, content, existing_tags: tags, options: { threshold: 0.6, autoApply: true } } });
      }
      if (embeddingAvailable) {
        await taskRepo.create({ task_type: TaskType.VECTOR_EMBEDDING, entry_id: id, payload: { entry_id: id, text: `${summary} ${content}`.slice(0, 4000) } });
      }
    });
  } else {
    id = await engine.insert({
      content, summary, type,
      tier: tierForType(type), scope, user_id: userId,
      project_id: scopeCtx?.projectId ?? null,
      source, tags, agent_name: agentName,
      owner: inferOwner(source),
    });
    if (tagAnalyzer) {
      tagAnalyzer.analyzeTags(content).then(async result => {
        if (result.appliedTags.length > 0) {
          const existing = tags ? tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
          const merged = [...new Set([...existing, ...result.appliedTags])];
          await engine.updateTags(id, merged.join(','));
        }
      }).catch((err) => { logger.error({ err }, '[TagAnalyzer] LLM analysis failed:'); });
    }
  }

  await engine.auditLog('INGEST', id);
  await upsertGraphNode(id, summary, type, scopeCtx?.projectId ?? null);

  const supersedesId = a.supersedes_id as number | undefined;
  if (supersedesId) {
    const chainResult = await createSupersessionChain(engine, id, supersedesId);
    if (!chainResult.ok) {
      return `Knowledge entry created: id=${id} — supersession failed: ${chainResult.reason}`;
    }
  }

  return `Knowledge entry created: id=${id}, type=${type}, scope=${scope}, tier=${tierForType(type)} - "${summary}"`;
}

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

  const format = classifyFormat({ filePath });
  const providedContent = a.content as string | undefined;
  const contentBase64 = a.content_base64 as string | undefined;

  let text: string | undefined;
  if (format === 'markdown' || format === 'text') {
    text = contentBase64 ? Buffer.from(contentBase64, 'base64').toString('utf-8') : providedContent;
    if (!text) {
      const resolved = resolvePath(filePath, workspace);
      if (!fs.existsSync(resolved)) return `Error: file not found — ${resolved}`;
      text = await fs.promises.readFile(resolved, 'utf-8');
    }
  } else if (contentBase64 && contentBase64.trim().length > 0) {
    text = Buffer.from(contentBase64, 'base64').toString('utf-8');
  } else if (providedContent && providedContent.trim().length > 0) {
    text = providedContent;
  } else {
    const resolved = resolvePath(filePath, workspace);
    if (!fs.existsSync(resolved)) return unconvertibleMessage(filePath, 'no-tool');
    if (!resolver) return unconvertibleMessage(filePath, 'no-tool');
    const res = await resolver.resolve({ filePath: resolved, ext: normalizeExt(filePath) });
    if (!res.ok) return unconvertibleMessage(filePath, res.reason);
    text = res.markdown;
  }

  if (scopeCtx) {
    const { clause, params } = buildIngestFileDeleteClause(scopeCtx as ProjectContext, filePath);
    // Delete stale graph nodes before removing KB entries (while IDs still exist)
    try {
      const adminAdapter = getAdminAdapter();
      const oldIds = await engine.getAdapter().allAsync<{ id: number }>(
        'SELECT id FROM knowledge_entries WHERE source = $1 AND project_id = $2',
        [filePath, (scopeCtx as any).projectId ?? ''],
      );
      if (oldIds.length > 0) {
        const idList = oldIds.map(r => `'doc-${r.id}'`).join(',');
        await adminAdapter.runAsync(`DELETE FROM graph_nodes WHERE entry_id IN (${idList})`, []);
      }
    } catch { /* non-fatal */ }
    await engine.getAdapter().runAsync(clause, params);
  } else {
    // Delete stale graph nodes before removing KB entries (while IDs still exist)
    try {
      const adminAdapter = getAdminAdapter();
      const oldIds = await engine.getAdapter().allAsync<{ id: number }>(
        'SELECT id FROM knowledge_entries WHERE source = $1',
        [filePath],
      );
      if (oldIds.length > 0) {
        const idList = oldIds.map(r => `'doc-${r.id}'`).join(',');
        await adminAdapter.runAsync(`DELETE FROM graph_nodes WHERE entry_id IN (${idList})`, []);
      }
    } catch { /* non-fatal */ }
    await engine.getAdapter().runAsync('DELETE FROM knowledge_entries WHERE source = ?', [filePath]);
  }

  // SA4E-53: PostgreSQL rejects null bytes (0x00) in text columns
  text = text.replace(/\x00/g, '');

  const sections = text.split(/^#{1,3}\s+/m).filter(s => s.trim());
  let created = 0;
  const fileMeta = loadFileMetadata(workspace);
  const meta = fileMeta[filePath.replace(/\\/g, '/')];
  const structuredMap = meta ? JSON.stringify({ fileCreatedAt: meta.fileCreatedAt, fileAuthor: meta.fileAuthor, fileVersion: meta.fileVersion }) : undefined;
  const taskRepo = dbAdapter ? new PendingTaskRepository(dbAdapter) : undefined;

  for (const sec of (sections.length > 0 ? sections : [text])) {
    const summary = sec.split('\n')[0]?.trim().slice(0, 120) || filePath;
    const id = await engine.insert({ content: sec.trim(), summary, type, tier: tierForType(type), scope, user_id: userId, project_id: scopeCtx?.projectId ?? null, source: filePath, tags: '' });
    if (structuredMap) {
      await engine.updateStructuredMap(id, structuredMap);
    }
    if (taskRepo) {
      await taskRepo.create({ task_type: TaskType.TAG_ENRICHMENT, entry_id: id, payload: { entry_id: id, content: sec.trim(), existing_tags: '', options: { threshold: 0.6, autoApply: true } } });
      if (embeddingAvailable) {
        await taskRepo.create({ task_type: TaskType.VECTOR_EMBEDDING, entry_id: id, payload: { entry_id: id, text: `${summary} ${sec.trim()}`.slice(0, 4000) } });
      }
    }
    created++;
    await upsertGraphNode(id, summary, type, scopeCtx?.projectId ?? null);
  }
  await engine.auditLog('INGEST_FILE');
  return JSON.stringify({ status: 'ingested', entries: created, file: filePath } satisfies IngestFileResponse);
}

export function handlePin(a: Args): string {
  const action = (a.action as string) || 'list';
  const id = a.entry_id as number;
  const PIN_ACTIONS: Record<string, () => string> = {
    pin:         () => id ? `Pinned #${id}` : 'Error: entry_id required',
    unpin:       () => id ? `Unpinned #${id}` : 'Error: entry_id required',
    list:        () => '[]',
    get_context: () => '(no pinned entries)',
  };
  return (PIN_ACTIONS[action] ?? (() => `Unknown pin action: ${action}`))();
}

export function handleMap(a: Args): string {
  const action = (a.action as string) || 'get';
  const id = a.entry_id as number;
  const MAP_ACTIONS: Record<string, () => string> = {
    get:    () => id ? '{}' : 'Error: entry_id required',
    update: () => id ? `Updated map for #${id}` : 'Error: entry_id required',
  };
  return (MAP_ACTIONS[action] ?? (() => `Unknown map action: ${action}`))();
}

/** OCP: action handlers registered in a map — add new actions without modifying this function. */
type CrudActionFn = (engine: MemoryEngine, scopeCtx: ScopeContext | undefined, a: Args) => Promise<string>;

const CRUD_ACTIONS: Record<string, CrudActionFn> = {
  get: async (engine, scopeCtx, a) => {
    const id = a.id as number;
    if (!id) return 'Error: id required';
    const raw = await engine.findById(id);
    const e = scopeCtx ? validateReadAccess(scopeCtx as ProjectContext, raw) : raw;
    if (!e) return `Not found: ${id}`;
    await engine.recordAccess(id);
    return `#${e.id} [${e.type}] ${e.summary}\nTier: ${e.tier} | Scope: ${e.scope ?? 'USER'} | Tags: ${e.tags}\n${e.content}`;
  },
  delete: async (engine, scopeCtx, a) => {
    const id = a.id as number;
    if (!id) return 'Error: id required';
    const e = await engine.findById(id);
    if (!e) return `Not found: ${id}`;
    if (scopeCtx) {
      const v = validateMutationOwnership(scopeCtx as ProjectContext, e);
      if (!v.allowed) return `Error: cannot delete — ${v.reason}`;
    }
    await engine.deleteEntry(id);
    await engine.auditLog('DELETE', id);
    return `Deleted #${id}`;
  },
  list: async (engine, scopeCtx, a) => {
    const entries = await engine.findFiltered(a.tier as string, a.type as string, (a.limit as number) ?? 20, scopeCtx);
    return entries.length === 0 ? 'No entries' : entries.map(e => `#${e.id} [${e.type}] ${e.summary.slice(0, 80)} (${e.tier}|${e.scope ?? 'USER'})`).join('\n');
  },
};

export async function handleCrud(engine: MemoryEngine, scopeCtx: ScopeContext | undefined, a: Args): Promise<string> {
  const action = (a.action as string) || 'list';
  const handler = CRUD_ACTIONS[action];
  if (!handler) return `Unknown crud action: ${action}`;
  return handler(engine, scopeCtx, a);
}



