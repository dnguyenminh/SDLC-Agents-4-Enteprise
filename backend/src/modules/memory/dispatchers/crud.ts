import * as fs from 'fs';
import type { MemoryEngine } from '../engine/core.js';
import type { KBScope, ScopeContext } from '../models.js';
import type { TagAnalyzerService } from '../llm/analyzer.js';
import type { ProjectContext } from '../ProjectContext.js';
import { validateReadAccess, validateMutationOwnership, buildIngestFileDeleteClause } from '../IsolationLayer.js';
import { tierForType, inferOwner, resolvePath } from './helpers.js';
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

export function handleIngestFile(engine: MemoryEngine, scopeCtx: ScopeContext | undefined, workspace: string, a: Args): string {
  const filePath = a.file_path as string;
  if (!filePath) return 'Error: file_path required';
  const type = (a.type as string) ?? 'CONTEXT';
  const scope = ((a.scope as string) ?? 'USER').toUpperCase() as KBScope;
  const userId = (a.user_id as string) ?? scopeCtx?.userId ?? null;

  let text = a.content as string;
  if (!text) {
    const resolved = resolvePath(filePath, workspace);
    if (!fs.existsSync(resolved)) return `Error: file not found — ${resolved}`;
    text = fs.readFileSync(resolved, 'utf-8');
  }

  if (scopeCtx) {
    const { clause, params } = buildIngestFileDeleteClause(
      scopeCtx as ProjectContext, filePath,
    );
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
  return `Ingested: ${created} entries from ${filePath} (scope=${scope})`;
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
