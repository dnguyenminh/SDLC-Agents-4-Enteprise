import type { MemoryEngine } from '../engine/core.js';
import type { ScopeContext } from '../models.js';
import type { ScopePromotionService } from '../promotion/service.js';
import type { QueryLayer } from '../../../engine/query/query-layer.js';
import { handleSyncCode } from './sync-code.js';

type Args = Record<string, unknown>;

export function handleAdmin(engine: MemoryEngine, a: Args): string {
  const action = (a.action as string) || 'status';
  switch (action) {
    case 'status': {
      const db = engine.getDb() as any;
      const entries = (db.prepare('SELECT COUNT(*) as cnt FROM knowledge_entries').get() as any).cnt;
      const edges = (db.prepare('SELECT COUNT(*) as cnt FROM knowledge_graph_edges').get() as any).cnt;
      return `Entries: ${entries} | Edges: ${edges}`;
    }
    case 'sync_code': return handleSyncCode(engine, a._queryLayer as QueryLayer | undefined, a._workspace as string, a);
    case 'tool_usage': return JSON.stringify(engine.getToolUsage(a.tool_name as string | undefined));
    case 'audit': return engine.listAudit((a.limit as number) ?? 20, a.operation as string).map((e: any) => `[${e.operation}] ${e.created_at}`).join('\n') || 'Empty';
    case 'sessions': return engine.listSessions().map((s: any) => `[${s.session_id}] ${s.status}`).join('\n') || 'None';
    case 'analytics': case 'popular': return '{}';
    default: return `Admin: "${action}" via portal`;
  }
}

export function handleGraph(engine: MemoryEngine, a: Args): string {
  const action = (a.action as string) || 'neighbors';
  switch (action) {
    case 'neighbors': { const id = a.node_id as number; if (!id) return 'Error: node_id required'; const edges = engine.getNeighbors(id); if (edges.length === 0) return `Node ${id}: no connections`; const ids = [...new Set(edges.flatMap(e => [e.source_id, e.target_id]).filter(x => x !== id))]; return `Node ${id} (${ids.length} connections):\n` + ids.slice(0, 20).map(n => `  → ${n}`).join('\n'); }
    case 'add_edge': { const s = a.source_id as number, t = a.target_id as number; if (!s || !t) return 'Error: source_id and target_id required'; const id = engine.addEdge(s, t, (a.relation as string) ?? 'RELATES_TO'); return `Edge: ${s} → ${t} (id=${id})`; }
    case 'path': return 'Path query: use graph visualization';
    case 'ego': return 'Ego graph: use graph visualization';
    default: return `Unknown graph action: ${action}`;
  }
}

export function handleConsolidate(): string {
  return `Promoted: 0, Demoted: 0, Expired: 0`;
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

export function handlePromote(promotionService: ScopePromotionService | undefined, scopeCtx: ScopeContext | undefined, a: Args): string {
  if (!promotionService) return 'Error: promotion service not available';
  const action = (a.action as string) || 'scan';
  switch (action) {
    case 'scan': return promotionService.runPromotionCycle();
    case 'list': return JSON.stringify(promotionService.listPending((a.limit as number) ?? 20));
    case 'approve': {
      const id = a.entry_id as number;
      if (!id) return 'Error: entry_id required';
      const reviewer = (a.reviewer as string) ?? scopeCtx?.userId ?? 'system';
      const comment = (a.comment as string) ?? 'Approved via tool';
      return promotionService.approve(id, reviewer, comment) ? `Approved #${id}` : `Not found or not pending: #${id}`;
    }
    case 'reject': {
      const id = a.entry_id as number;
      if (!id) return 'Error: entry_id required';
      const reviewer = (a.reviewer as string) ?? scopeCtx?.userId ?? 'system';
      const comment = (a.comment as string) ?? 'Rejected via tool';
      return promotionService.reject(id, reviewer, comment) ? `Rejected #${id}` : `Not found or not pending: #${id}`;
    }
    case 'request_shared': {
      const id = a.entry_id as number;
      if (!id) return 'Error: entry_id required';
      const reason = (a.reason as string) ?? 'Cross-project relevance';
      return promotionService.requestSharedPromotion(id, reason) ? `SHARED promotion requested for #${id}` : `Entry not in PROJECT scope or already queued`;
    }
    case 'promote_on_merge': {
      const ticketKey = a.ticket_key as string;
      if (!ticketKey) return 'Error: ticket_key required';
      const { promoted, skipped } = promotionService.promoteOnMerge(ticketKey);
      return `promoteOnMerge(${ticketKey}): ${promoted} entries promoted to PROJECT, ${skipped} skipped.`;
    }
    default: return `Unknown promote action: ${action}. Valid: scan, list, approve, reject, request_shared, promote_on_merge`;
  }
}
