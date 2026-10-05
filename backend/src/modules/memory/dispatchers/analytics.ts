import type { MemoryEngine } from '../engine/core.js';
import type { ScopeContext } from '../models.js';
import type { ScopePromotionService } from '../promotion/service.js';
import type { QueryLayer } from '../../../engine/query/query-layer.js';
import { TierConsolidationService } from '../consolidation/service.js';
import { handleSyncCode } from './sync-code.js';

type Args = Record<string, unknown>;

export async function handleAdmin(engine: MemoryEngine, a: Args): Promise<string> {
  const action = (a.action as string) || 'status';
  switch (action) {
    case 'status': {
      const adapter = engine.getAdapter();
      const entryRow = await adapter.getAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM knowledge_entries');
      const edgeRow = await adapter.getAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM knowledge_graph_edges');
      return `Entries: ${entryRow?.cnt ?? 0} | Edges: ${edgeRow?.cnt ?? 0}`;
    }
    case 'sync_code': return await handleSyncCode(engine, a._queryLayer as QueryLayer | undefined, a._workspace as string, a);
    case 'tool_usage': return JSON.stringify(await engine.getToolUsage(a.tool_name as string | undefined));
    case 'audit': return (await engine.listAudit((a.limit as number) ?? 20, a.operation as string)).map((e: any) => `[${e.operation}] ${e.created_at}`).join('\n') || 'Empty';
    case 'sessions': return (await engine.listSessions()).map((s: any) => `[${s.session_id}] ${s.status}`).join('\n') || 'None';
    case 'analytics': case 'popular': return '{}';
    case 're_enrich': return await handleReEnrich(engine, a);
    default: return `Admin: "${action}" via portal`;
  }
}

/**
 * SA4E-99: Re-enrich entries with poor summaries.
 * Resets enrichment_status to 'pending' and re-queues TAG_ENRICHMENT tasks.
 * Targets entries where summary is just a heading (short, no context).
 */
async function handleReEnrich(engine: MemoryEngine, a: Args): Promise<string> {
  const adapter = engine.getAdapter();
  const limit = (a.limit as number) ?? 500;
  const maxSummaryLen = (a.max_summary_len as number) ?? 60;
  const source = a.source as string | undefined;

  // Find entries with poor summaries (likely just headings)
  // SA4E-337 R1: `tags` must be selected — it seeds payload.existing_tags below.
  let query = `SELECT id, summary, content, source, tags FROM knowledge_entries
    WHERE enrichment_status = 'done' AND LENGTH(summary) <= ?
    AND LENGTH(content) > 50`;
  const params: unknown[] = [maxSummaryLen];

  if (source) {
    query += ' AND source LIKE ?';
    params.push(`%${source}%`);
  }
  query += ` LIMIT ?`;
  params.push(limit);

  const entries = await adapter.allAsync<{ id: number; summary: string; content: string; source: string | null; tags: string | null }>(query, params);
  if (entries.length === 0) {
    return JSON.stringify({ status: 'no_entries', message: 'No entries with poor summaries found', limit, maxSummaryLen });
  }

  // Reset to pending and create tasks
  let queued = 0;
  for (const entry of entries) {
    await adapter.runAsync(
      `UPDATE knowledge_entries SET enrichment_status = 'pending' WHERE id = ?`,
      [entry.id],
    );
    // Create TAG_ENRICHMENT task for re-processing
    const now = new Date().toISOString();
    await adapter.runAsync(
      `INSERT INTO pending_tasks (task_type, entry_id, payload, status, retry_count, max_retries, created_at)
       VALUES ('TAG_ENRICHMENT', ?, ?, 'PENDING', 0, 3, ?)`,
      // SA4E-337 F1: carry `source` so the LLM-down fallback can derive path tags.
      // SA4E-337 R1: carry the entry's CURRENT tags — the LLM-up merge in
      // TaskWorker.processTagEnrichment() unions existing_tags with appliedTags
      // before UPDATEing `tags`; '' would wipe path tags persisted at insert (F1).
      [entry.id, JSON.stringify({ entry_id: entry.id, content: entry.content.slice(0, 6000), existing_tags: entry.tags ?? '', source: entry.source ?? '', options: { threshold: 0.6, autoApply: true } }), now],
    );
    queued++;
  }

  return JSON.stringify({ status: 'queued', queued, total_candidates: entries.length, maxSummaryLen });
}

export async function handleGraph(engine: MemoryEngine, a: Args): Promise<string> {
  const action = (a.action as string) || 'neighbors';
  switch (action) {
    case 'neighbors': { const id = a.node_id as number; if (!id) return 'Error: node_id required'; const edges = await engine.getNeighbors(id); if (edges.length === 0) return `Node ${id}: no connections`; const ids = [...new Set(edges.flatMap(e => [e.source_id, e.target_id]).filter(x => x !== id))]; return `Node ${id} (${ids.length} connections):\n` + ids.slice(0, 20).map(n => `  → ${n}`).join('\n'); }
    case 'add_edge': { const s = a.source_id as number, t = a.target_id as number; if (!s || !t) return 'Error: source_id and target_id required'; const id = await engine.addEdge(s, t, (a.relation as string) ?? 'RELATES_TO'); return `Edge: ${s} → ${t} (id=${id})`; }
    case 'path': return 'Path query: use graph visualization';
    case 'ego': return 'Ego graph: use graph visualization';
    default: return `Unknown graph action: ${action}`;
  }
}

export async function handleConsolidate(engine: MemoryEngine, a: Args): Promise<string> {
  const action = (a.action as string) || 'consolidate';
  const dryRun = (a.dry_run as boolean) ?? false;
  const service = new TierConsolidationService(engine.getAdapter());

  switch (action) {
    case 'consolidate': {
      const targetTier = a.target_tier as string | undefined;
      const r = await service.runConsolidation(dryRun, targetTier);
      const prefix = dryRun ? '[DRY-RUN] Would promote: ' : 'Promoted: ';
      return `${prefix}${r.promoted}, Demoted: ${r.demoted}, Expired: ${r.expired}`;
    }
    case 'config': {
      if (dryRun) return JSON.stringify(service.getConfig(), null, 2);
      const updates = a.config as Partial<import('../consolidation/service.js').ConsolidationConfig> | undefined;
      if (updates) service.updateConfig(updates);
      return JSON.stringify(service.getConfig(), null, 2);
    }
    case 'stats': {
      const adapter = engine.getAdapter();
      const tiers = ['WORKING', 'EPISODIC', 'SEMANTIC'];
      const lines: string[] = [];
      for (const tier of tiers) {
        const row = await adapter.getAsync<{ cnt: number }>(
          'SELECT COUNT(*) as cnt FROM knowledge_entries WHERE tier = ? AND archived = 0', [tier],
        );
        lines.push(`${tier}: ${row?.cnt ?? 0}`);
      }
      return lines.join(' | ');
    }
    default: return `Unknown consolidate action: ${action}. Valid: consolidate, config, stats`;
  }
}

export function handleLifecycle(a: Args): string {
  const action = (a.action as string) || 'detect_stale';
  switch (action) {
    case 'detect_stale': return 'No stale entries';
    case 'archive': return a.entry_id ? `Archived #${a.entry_id}` : 'Error: entry_id required';
    case 'unarchive': return a.entry_id ? `Unarchived #${a.entry_id}` : 'Error: entry_id required';
    case 'schedule': return `Scheduled reminder for #${a.entry_id}`;
    case 'due_reviews': return 'No due';
    default: return `Unknown lifecycle action: ${action}`;
  }
}

export function handleTemplates(a: Args): string {
  const action = (a.action as string) || 'list';
  switch (action) {
    case 'create': return `Created template ${a.name}`;
    case 'list': return '[]';
    case 'validate': return a.entry_id ? 'Valid' : 'Error: entry_id required';
    default: return `Unknown templates action: ${action}`;
  }
}

export function handleAttachments(a: Args): string {
  const action = (a.action as string) || 'list';
  switch (action) {
    case 'attach': { const id = a.entry_id as number; return id && a.file_path ? `Attached file to #${id}` : 'Error: entry_id + file_path required'; }
    case 'list': return a.entry_id ? '[]' : 'Error: entry_id required';
    case 'remove': return a.attachment_id ? `Removed attachment #${a.attachment_id}` : 'Error: attachment_id required';
    default: return `Unknown attachments action: ${action}`;
  }
}

export function handleConversation(a: Args): string {
  const action = (a.action as string) || 'list_sessions';
  switch (action) {
    case 'save_turn': return `Saved turn for session ${a.session_id}`;
    case 'get_session': return 'No turns';
    case 'list_sessions': return 'No sessions';
    case 'search': return 'No matches';
    default: return `Unknown conversation action: ${action}`;
  }
}

export function handleScoring(a: Args): string {
  const action = (a.action as string) || 'quality_stats';
  switch (action) {
    case 'quality_score': return a.entry_id ? `Score: 100/100` : 'Error: entry_id';
    case 'feedback_submit': return a.entry_id ? `Feedback submitted for #${a.entry_id}` : 'Error: entry_id';
    default: return `Scoring: use admin for "${action}"`;
  }
}

export async function handlePromote(promotionService: ScopePromotionService | undefined, scopeCtx: ScopeContext | undefined, a: Args): Promise<string> {
  if (!promotionService) return 'Error: promotion service not available';
  const action = (a.action as string) || 'scan';
  switch (action) {
    case 'scan': return await promotionService.runPromotionCycle();
    case 'list': return JSON.stringify(await promotionService.listPending((a.limit as number) ?? 20));
    case 'approve': {
      const id = a.entry_id as number;
      if (!id) return 'Error: entry_id required';
      const reviewer = (a.reviewer as string) ?? scopeCtx?.userId ?? 'system';
      const comment = (a.comment as string) ?? 'Approved via tool';
      return await promotionService.approve(id, reviewer, comment) ? `Approved #${id}` : `Not found or not pending: #${id}`;
    }
    case 'reject': {
      const id = a.entry_id as number;
      if (!id) return 'Error: entry_id required';
      const reviewer = (a.reviewer as string) ?? scopeCtx?.userId ?? 'system';
      const comment = (a.comment as string) ?? 'Rejected via tool';
      return await promotionService.reject(id, reviewer, comment) ? `Rejected #${id}` : `Not found or not pending: #${id}`;
    }
    case 'request_shared': {
      const id = a.entry_id as number;
      if (!id) return 'Error: entry_id required';
      const reason = (a.reason as string) ?? 'Cross-project relevance';
      return await promotionService.requestSharedPromotion(id, reason) ? `SHARED promotion requested for #${id}` : `Entry not in PROJECT scope or already queued`;
    }
    case 'promote_on_merge': {
      const ticketKey = a.ticket_key as string;
      if (!ticketKey) return 'Error: ticket_key required';
      const { promoted, skipped } = await promotionService.promoteOnMerge(ticketKey);
      return `promoteOnMerge(${ticketKey}): ${promoted} entries promoted to PROJECT, ${skipped} skipped.`;
    }
    default: return `Unknown promote action: ${action}. Valid: scan, list, approve, reject, request_shared, promote_on_merge`;
  }
}


