import * as fs from 'fs';
import type { MemoryEngine } from '../engine/core.js';
import type { KBScope, ScopeContext } from '../models.js';
import type { TagAnalyzerService } from '../llm/analyzer.js';
import type { ProjectContext } from '../ProjectContext.js';
import { validateReadAccess, validateMutationOwnership, buildIngestFileDeleteClause } from '../IsolationLayer.js';
import { tierForType, inferOwner, resolvePath } from './helpers.js';
import { classifyFormat, normalizeExt } from '../ingest/FormatClassifier.js';
import type { ConvertToolResolver } from '../ingest/ConvertToolResolver.js';
import { createSupersessionChain } from './supersession.js';
import pino from 'pino';

const logger = pino({ name: 'memory-tool-dispatcher' });

type Args = Record<string, unknown>;

export function handleIngest(engine: MemoryEngine, scopeCtx: ScopeContext | undefined, tagAnalyzer: TagAnalyzerService | undefined, a: Args): string {
  const content = a.content as string;
  if (!content) return 'Error: content required';
  const type = (a.type as string) ?? 'CONTEXT';
  const source = a.source as string | undefined;
  let tags = Array.isArray(a.tags) ? (a.tags as string[]).join(',') : ((a.tags as string) ?? '');
  const summary = (a.summary as string) ?? (a.title as string) ?? content.slice(0, 120);
  const agentName = a.agent_name as string | undefined;
  const scope = ((a.scope as string) ?? 'USER').toUpperCase() as KBScope;
  const userId = (a.user_id as string) ?? scopeCtx?.userId ?? null;

  const id = engine.insert({
    content, summary, type,
    tier: tierForType(type),
    scope, user_id: userId,
    project_id: scopeCtx?.projectId ?? null,
    source, tags,
    agent_name: agentName,
    owner: inferOwner(source),
  });
  engine.auditLog('INGEST', id);

  const supersedesId = a.supersedes_id as number | undefined;
  if (supersedesId) {
    const chainResult = createSupersessionChain(engine, id, supersedesId);
    if (!chainResult.ok) {
      return `Knowledge entry created: id=${id} — supersession failed: ${chainResult.reason}`;
    }
  }

  if (tagAnalyzer) {
    logger.debug({ entryId: id, contentLength: content.length }, '[TagAnalyzer] Starting analysis');
    tagAnalyzer.analyzeTags(content).then(result => {
      logger.debug({ entryId: id, result }, '[TagAnalyzer] Analysis result');
      if (result.appliedTags.length > 0) {
        const existing = tags ? tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        const merged = [...new Set([...existing, ...result.appliedTags])];
        engine.updateTags(id, merged.join(','));
        logger.debug({ entryId: id, tags: merged.join(',') }, '[TagAnalyzer] Tags applied');
      }
    }).catch((err) => { logger.error({ err }, '[TagAnalyzer] LLM analysis failed:'); });
  } else {
    logger.warn({ tagAnalyzer }, '[TagAnalyzer] Not initialized');
  }

  return `Knowledge entry created: id=${id}, type=${type}, scope=${scope}, tier=${tierForType(type)} - "${summary}"`;
}

/** Structured response for client consumption (Task 8). */
export interface IngestFileResponse {
  status: 'ingested' | 'unconvertible';
  entries?: number;
  file?: string;
  reason?: string;
}

/** Marker để client (extension) nhận biết file không convert được và log ra. */
export function unconvertibleMessage(filePath: string, reason: string): string {
  return JSON.stringify({ status: 'unconvertible', file: filePath, reason } satisfies IngestFileResponse);
}

/**
 * Ingest một file vào KB. (Design R4/R5/R6)
 * - markdown/text → Direct Ingest (đọc utf-8).
 * - binary (docx/xls/ảnh...) → convert qua ConvertToolResolver (dynamic tool).
 *   Không có tool / convert fail → trả marker UNCONVERTIBLE, KHÔNG index rác.
 */
export async function handleIngestFile(
  engine: MemoryEngine,
  scopeCtx: ScopeContext | undefined,
  workspace: string,
  a: Args,
  resolver?: ConvertToolResolver,
): Promise<string> {
  const filePath = a.file_path as string;
  if (!filePath) return 'Error: file_path required';
  const type = (a.type as string) ?? 'CONTEXT';
  const scope = ((a.scope as string) ?? 'USER').toUpperCase() as KBScope;
  const userId = (a.user_id as string) ?? scopeCtx?.userId ?? null;

  const format = classifyFormat({ filePath });
  const providedContent = a.content as string | undefined;

  let text: string | undefined;
  if (format === 'markdown' || format === 'text') {
    // Direct Ingest — dùng content injected nếu có, ngược lại đọc utf-8 (R5)
    text = providedContent;
    if (!text) {
      const resolved = resolvePath(filePath, workspace);
      if (!fs.existsSync(resolved)) return `Error: file not found — ${resolved}`;
      text = await fs.promises.readFile(resolved, 'utf-8');
    }
  } else if (providedContent && providedContent.trim().length > 0) {
    // Binary nhưng client đã convert sẵn và gửi markdown/text — dùng trực tiếp (tương thích ngược).
    text = providedContent;
  } else {
    // Binary (R6) — KHÔNG đọc utf-8; convert qua dynamic tool
    const resolved = resolvePath(filePath, workspace);
    if (!fs.existsSync(resolved)) { return unconvertibleMessage(filePath, 'no-tool'); }
    if (!resolver) { return unconvertibleMessage(filePath, 'no-tool'); }
    const res = await resolver.resolve({ filePath: resolved, ext: normalizeExt(filePath) });
    if (!res.ok) { return unconvertibleMessage(filePath, res.reason); }
    text = res.markdown;
  }

  if (scopeCtx) {
    const { clause, params } = buildIngestFileDeleteClause(scopeCtx as ProjectContext, filePath);
    engine.getDb().prepare(clause).run(...params);
  } else {
    engine.getDb().prepare('DELETE FROM knowledge_entries WHERE source = ?').run(filePath);
  }

  const sections = text.split(/^#{1,3}\s+/m).filter(s => s.trim());
  let created = 0;
  for (const sec of (sections.length > 0 ? sections : [text])) {
    const summary = sec.split('\n')[0]?.trim().slice(0, 120) || filePath;
    engine.insert({ content: sec.trim(), summary, type, tier: tierForType(type), scope, user_id: userId, project_id: scopeCtx?.projectId ?? null, source: filePath, tags: '' });
    created++;
  }
  engine.auditLog('INGEST_FILE');
  return JSON.stringify({ status: 'ingested', entries: created, file: filePath } satisfies IngestFileResponse);
}

export function handlePin(a: Args): string {
  const action = (a.action as string) || 'list';
  const id = a.entry_id as number;
  switch (action) {
    case 'pin': return id ? `Pinned #${id}` : 'Error: entry_id required';
    case 'unpin': return id ? `Unpinned #${id}` : 'Error: entry_id required';
    case 'list': return '[]';
    case 'get_context': return '(no pinned entries)';
    default: return `Unknown pin action: ${action}`;
  }
}

export function handleMap(a: Args): string {
  const action = (a.action as string) || 'get';
  const id = a.entry_id as number;
  switch (action) {
    case 'get': return id ? '{}' : 'Error: entry_id required';
    case 'update': {
      if (!id) return 'Error: entry_id required';
      return `Updated map for #${id}`;
    }
    default: return `Unknown map action: ${action}`;
  }
}

export function handleCrud(engine: MemoryEngine, scopeCtx: ScopeContext | undefined, a: Args): string {
  const action = (a.action as string) || 'list';
  switch (action) {
    case 'get': {
      const id = a.id as number;
      if (!id) return 'Error: id required';
      const raw = engine.findById(id);
      const e = scopeCtx
        ? validateReadAccess(scopeCtx as ProjectContext, raw)
        : raw;
      if (!e) return `Not found: ${id}`;
      engine.recordAccess(id);
      return `#${e.id} [${e.type}] ${e.summary}\nTier: ${e.tier} | Scope: ${e.scope ?? 'USER'} | Tags: ${e.tags}\n${e.content}`;
    }
    case 'delete': {
      const id = a.id as number;
      if (!id) return 'Error: id required';
      const e = engine.findById(id);
      if (!e) return `Not found: ${id}`;
      if (scopeCtx) {
        const v = validateMutationOwnership(scopeCtx as ProjectContext, e);
        if (!v.allowed) return `Error: cannot delete — ${v.reason}`;
      }
      engine.deleteEntry(id);
      engine.auditLog('DELETE', id);
      return `Deleted #${id}`;
    }
    case 'list': {
      const entries = engine.findFiltered(a.tier as string, a.type as string, (a.limit as number) ?? 20, scopeCtx);
      return entries.length === 0 ? 'No entries' : entries.map(e => `#${e.id} [${e.type}] ${e.summary.slice(0, 80)} (${e.tier}|${e.scope ?? 'USER'})`).join('\n');
    }
    default: return `Unknown crud action: ${action}`;
  }
}
