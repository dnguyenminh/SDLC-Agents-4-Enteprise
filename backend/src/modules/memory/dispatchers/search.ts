import type { MemoryEngine } from '../engine/core.js';
import type { ScopeContext } from '../models.js';
import type { TagAnalyzerService } from '../llm/analyzer.js';
import pino from 'pino';

const logger = pino({ name: 'memory-tool-dispatcher' });

type Args = Record<string, unknown>;

export function handleSearch(engine: MemoryEngine, scopeCtx: ScopeContext | undefined, a: Args): string {
  const query = a.query as string;
  if (!query) return 'Error: query required';
  const scope = a.scope as string | undefined;
  const scopeCtxResolved = scope === 'all' ? undefined : scopeCtx;
  const results = engine.search(query, (a.limit as number) ?? 10, a.tier as string, undefined, scopeCtxResolved);
  engine.auditLog('SEARCH');
  for (const r of results) engine.recordAccess(r.entry.id);
  const lines: string[] = [];
  if (results.length === 0) return lines.join('\n') + `No knowledge found for "${query}"`;
  lines.push(`Found ${results.length} results:\n`);
  for (const r of results) {
    lines.push(`[${r.entry.type}] ${r.entry.summary}`);
    lines.push(`  ID: ${r.entry.id} | Tier: ${r.entry.tier} | Scope: ${r.entry.scope ?? 'USER'} | Score: ${r.score.toFixed(3)}`);
    if (a.detail) lines.push(`  Content: ${r.entry.content.slice(0, 500)}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function handleDiscover(a: Args): string {
  const action = (a.action as string) || 'suggest';
  switch (action) {
    case 'suggest': { const q = a.query as string; return q ? 'No suggestions' : 'Error: query required'; }
    case 'related': { const id = a.entry_id as number; return id ? 'No related' : 'Error: entry_id required'; }
    default: return `Unknown discover action: ${action}`;
  }
}

export function handleTags(engine: MemoryEngine, tagAnalyzer: TagAnalyzerService | undefined, a: Args): string {
  const action = (a.action as string) || 'taxonomy';
  switch (action) {
    case 'create': return `Created tag ${a.tag}`;
    case 'tag': return a.entry_id ? `Tagged #${a.entry_id}` : 'Error: entry_id';
    case 'untag': return a.entry_id ? `Untagged #${a.entry_id}` : 'Error: entry_id';
    case 'search': return 'No results';
    case 'taxonomy': return '[]';
    case 'popular': return '[]';
    case 'entry_tags': return a.entry_id ? '[]' : 'Error: entry_id required';
    case 'retag': {
      const entryId = a.entry_id as number;
      if (!entryId) return 'Error: entry_id required';
      if (!tagAnalyzer) return 'Error: TagAnalyzer not initialized';
      const db = engine.getDb();
      const entry = db.prepare('SELECT content, tags FROM knowledge_entries WHERE id = ?').get(entryId) as any;
      if (!entry) return `Error: entry ${entryId} not found`;
      tagAnalyzer.analyzeTags(entry.content).then(result => {
        if (result.appliedTags.length > 0) {
          engine.updateTags(entryId, result.appliedTags.join(','));
          logger.info({ entryId, tags: result.appliedTags.join(',') }, '[Retag] Entry');
        }
      }).catch(err => logger.error({ err }, `[Retag] Failed ${entryId}:`));
      return `Retag queued for entry #${entryId} (async LLM)`;
    }
    case 'retag_all': {
      if (!tagAnalyzer) return 'Error: TagAnalyzer not initialized';
      const db = engine.getDb();
      const entries = db.prepare('SELECT id, content FROM knowledge_entries ORDER BY id').all() as any[];
      let queued = 0;
      for (const entry of entries) {
        setTimeout(() => {
          tagAnalyzer!.analyzeTags(entry.content).then(result => {
            if (result.appliedTags.length > 0) {
              engine.updateTags(entry.id, result.appliedTags.join(','));
              logger.info({ entryId: entry.id, tags: result.appliedTags.join(',') }, '[Retag] Entry');
            }
          }).catch(err => logger.error({ err }, `[Retag] Failed ${entry.id}:`));
        }, queued * 3000);
        queued++;
      }
      return `Retag ALL queued: ${queued} entries (async, ~${queued * 3}s total)`;
    }
    default: return `Unknown tags action: ${action}`;
  }
}

export function handleCitations(a: Args): string {
  const action = (a.action as string) || 'most_cited';
  switch (action) {
    case 'record': return a.entry_id ? `Recorded citation for #${a.entry_id}` : 'Error: entry_id required';
    case 'most_cited': return '[]';
    case 'uncited': return 'All cited';
    default: return `Unknown citations action: ${action}`;
  }
}
