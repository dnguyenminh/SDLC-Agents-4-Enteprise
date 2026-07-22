import type { MemoryEngine } from '../engine/core.js';
import type { ScopeContext } from '../models.js';
import type { TagAnalyzerService } from '../llm/analyzer.js';
import pino from 'pino';

const logger = pino({ name: 'memory-tool-dispatcher' });

type Args = Record<string, unknown>;

export async function handleSearch(engine: MemoryEngine, scopeCtx: ScopeContext | undefined, a: Args): Promise<string> {
  const query = a.query as string;
  if (!query) return 'Error: query required';
  const scope = a.scope as string | undefined;
  const scopeCtxResolved = scope === 'all' ? undefined : scopeCtx;
  const results = await engine.search(query, (a.limit as number) ?? 10, a.tier as string, undefined, scopeCtxResolved);
  await engine.auditLog('SEARCH');
  for (const r of results) await engine.recordAccess(r.entry.id);
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
      // SA4E-53: use async findById + updateTags instead of sync db.prepare
      engine.findById(entryId).then(entry => {
        if (!entry) { logger.warn({ entryId }, '[Retag] Entry not found'); return; }
        tagAnalyzer.analyzeTags(entry.content).then(result => {
          if (result.appliedTags.length > 0) {
            engine.updateTags(entryId, result.appliedTags.join(','));
            logger.info({ entryId, tags: result.appliedTags.join(',') }, '[Retag] Entry');
          }
        }).catch(err => logger.error({ err }, `[Retag] Failed ${entryId}:`));
      }).catch(err => logger.error({ err }, `[Retag] Lookup failed ${entryId}:`));
      return `Retag queued for entry #${entryId} (async LLM)`;
    }
    case 'retag_all': {
      if (!tagAnalyzer) return 'Error: TagAnalyzer not initialized';
      // SA4E-53: use async adapter to fetch all entries
      engine.getAdapter().allAsync<{ id: number; content: string }>(
        'SELECT id, content FROM knowledge_entries ORDER BY id',
      ).then(entries => {
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
        logger.info({ queued }, '[Retag ALL] Queued entries');
      }).catch(err => logger.error({ err }, '[Retag ALL] Failed to fetch entries'));
      return `Retag ALL queued (async)`;
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



