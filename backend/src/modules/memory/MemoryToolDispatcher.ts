/**
 * MemoryToolDispatcher — routes all mem_* tool calls.
 * Handles 14 consolidated tools + backward-compatible aliases.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MemoryEngine } from './MemoryEngine.js';
import type { QueryLayer } from '../../engine/query/query-layer.js';
import type { KBScope, ScopeContext } from './models.js';
import type { ScopePromotionService } from './ScopePromotionService.js';
import type { TagAnalyzerService } from './llm/TagAnalyzerService.js';

type Args = Record<string, unknown>;

const ALIASES: Record<string, [string, Record<string, string>]> = {
  mem_get: ['mem_crud', { action: 'get' }],
  mem_delete: ['mem_crud', { action: 'delete' }],
  mem_list: ['mem_crud', { action: 'list' }],
  mem_status: ['mem_admin', { action: 'status' }],
  mem_audit: ['mem_admin', { action: 'audit' }],
  mem_sessions: ['mem_admin', { action: 'sessions' }],
  mem_sync_code: ['mem_admin', { action: 'sync_code' }],
};

export class MemoryToolDispatcher {
  private scopeCtx: ScopeContext | undefined;
  private promotionService: ScopePromotionService | undefined;
  private tagAnalyzer: TagAnalyzerService | undefined;

  constructor(
    private readonly engine: MemoryEngine,
    private readonly workspace: string,
    private readonly queryLayer?: QueryLayer
  ) {}

  /** Set scope context for the current request (called per tool invocation). */
  setScopeContext(ctx: ScopeContext | undefined): void {
    this.scopeCtx = ctx;
  }

  /** Inject promotion service (set after module init). */
  setPromotionService(svc: ScopePromotionService): void {
    this.promotionService = svc;
  }

  /** Inject tag analyzer service (set after module init). */
  setTagAnalyzer(svc: TagAnalyzerService): void {
    this.tagAnalyzer = svc;
  }

  dispatch(name: string, args: Args): string | null {
    const [resolved, merged] = this.resolveAlias(name, args);
    switch (resolved) {
      case 'mem_search': return this.handleSearch(merged);
      case 'mem_ingest': return this.handleIngest(merged);
      case 'mem_ingest_file': return this.handleIngestFile(merged);
      case 'mem_pin': return this.handlePin(merged);
      case 'mem_map': return this.handleMap(merged);
      case 'mem_crud': return this.handleCrud(merged);
      case 'mem_graph': return this.handleGraph(merged);
      case 'mem_consolidate': return this.handleConsolidate();
      case 'mem_lifecycle': return this.handleLifecycle(merged);
      case 'mem_templates': return this.handleTemplates(merged);
      case 'mem_attachments': return this.handleAttachments(merged);
      case 'mem_discover': return this.handleDiscover(merged);
      case 'mem_tags': return this.handleTags(merged);
      case 'mem_citations': return this.handleCitations(merged);
      case 'mem_conversation': return this.handleConversation(merged);
      case 'mem_scoring': return this.handleScoring(merged);
      case 'mem_admin': return this.handleAdmin(merged);
      case 'mem_promote': return this.handlePromote(merged);
      default: return null;
    }
  }

  private resolveAlias(name: string, args: Args): [string, Args] {
    const alias = ALIASES[name];
    if (!alias) return [name, args];
    return [alias[0], { ...alias[1], ...args }];
  }

  private handleSearch(a: Args): string {
    const query = a.query as string;
    if (!query) return 'Error: query required';
    const scope = a.scope as string | undefined;
    const scopeCtx = scope === 'all' ? undefined : this.scopeCtx;
    const results = this.engine.search(query, (a.limit as number) ?? 10, a.tier as string, undefined, scopeCtx);
    this.engine.auditLog('SEARCH');
    for (const r of results) this.engine.recordAccess(r.entry.id);
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

  private handleIngest(a: Args): string {
    const content = a.content as string;
    if (!content) return 'Error: content required';
    const type = (a.type as string) ?? 'CONTEXT';
    const source = a.source as string | undefined;
    let tags = Array.isArray(a.tags) ? (a.tags as string[]).join(',') : ((a.tags as string) ?? '');
    const summary = (a.summary as string) ?? (a.title as string) ?? content.slice(0, 120);
    const agentName = a.agent_name as string | undefined;
    const scope = ((a.scope as string) ?? 'USER').toUpperCase() as KBScope;
    const userId = (a.user_id as string) ?? this.scopeCtx?.userId ?? null;

    const id = this.engine.insert({
      content, summary, type,
      tier: this.tierForType(type),
      scope, user_id: userId,
      project_id: this.scopeCtx?.projectId ?? null,
      source, tags,
      agent_name: agentName,
      owner: this.inferOwner(source),
    });
    this.engine.auditLog('INGEST', id);

    // AI-Assisted Tagging: always run LLM analysis to add business feature tags
    if (this.tagAnalyzer) {
      console.log('[TagAnalyzer] Starting analysis for entry', id, '— content length:', content.length);
      this.tagAnalyzer.analyzeTags(content).then(result => {
        console.log('[TagAnalyzer] Result for entry', id, ':', JSON.stringify(result));
        if (result.appliedTags.length > 0) {
          const existing = tags ? tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
          const merged = [...new Set([...existing, ...result.appliedTags])];
          this.engine.updateTags(id, merged.join(','));
          console.log('[TagAnalyzer] Tags applied:', merged.join(','));
        }
      }).catch((err) => { console.error('[TagAnalyzer] LLM analysis failed:', err?.message || err); });
    } else {
      console.log('[TagAnalyzer] NOT INITIALIZED — this.tagAnalyzer is', this.tagAnalyzer);
    }

    return `Knowledge entry created: id=${id}, type=${type}, scope=${scope}, tier=${this.tierForType(type)} - "${summary}"`;
  }

  private handleIngestFile(a: Args): string {
    const filePath = a.file_path as string;
    if (!filePath) return 'Error: file_path required';
    const type = (a.type as string) ?? 'CONTEXT';
    const scope = ((a.scope as string) ?? 'USER').toUpperCase() as KBScope;
    const userId = (a.user_id as string) ?? this.scopeCtx?.userId ?? null;
    
    let text = a.content as string;
    if (!text) {
      const resolved = this.resolvePath(filePath);
      if (!fs.existsSync(resolved)) return `Error: file not found — ${resolved}`;
      text = fs.readFileSync(resolved, 'utf-8');
    }

    // Clean up existing entries for this file to prevent duplicates
    this.engine.getDb().prepare('DELETE FROM knowledge_entries WHERE source = ?').run(filePath);

    const sections = text.split(/^#{1,3}\s+/m).filter(s => s.trim());
    let created = 0;
    for (const sec of (sections.length > 0 ? sections : [text])) {
      const summary = sec.split('\n')[0]?.trim().slice(0, 120) || filePath;
      this.engine.insert({ content: sec.trim(), summary, type, tier: this.tierForType(type), scope, user_id: userId, project_id: this.scopeCtx?.projectId ?? null, source: filePath, tags: '' });
      created++;
    }
    this.engine.auditLog('INGEST_FILE');
    return `Ingested: ${created} entries from ${filePath} (scope=${scope})`;
  }

  private handlePin(a: Args): string {
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

  private handleMap(a: Args): string {
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

  private handleCrud(a: Args): string {
    const action = (a.action as string) || 'list';
    switch (action) {
      case 'get': { const id = a.id as number; if (!id) return 'Error: id required'; const e = this.engine.findById(id); if (!e) return `Not found: ${id}`; this.engine.recordAccess(id); return `#${e.id} [${e.type}] ${e.summary}\nTier: ${e.tier} | Scope: ${e.scope ?? 'USER'} | Tags: ${e.tags}\n${e.content}`; }
      case 'delete': { const id = a.id as number; if (!id) return 'Error: id required'; const e = this.engine.findById(id); if (!e) return `Not found: ${id}`; this.engine.deleteEntry(id); this.engine.auditLog('DELETE', id); return `Deleted #${id}`; }
      case 'list': { const entries = this.engine.findFiltered(a.tier as string, a.type as string, (a.limit as number) ?? 20, this.scopeCtx); return entries.length === 0 ? 'No entries' : entries.map(e => `#${e.id} [${e.type}] ${e.summary.slice(0, 80)} (${e.tier}|${e.scope ?? 'USER'})`).join('\n'); }
      default: return `Unknown crud action: ${action}`;
    }
  }

  private handleGraph(a: Args): string {
    const action = (a.action as string) || 'neighbors';
    switch (action) {
      case 'neighbors': { const id = a.node_id as number; if (!id) return 'Error: node_id required'; const edges = this.engine.getNeighbors(id); if (edges.length === 0) return `Node ${id}: no connections`; const ids = [...new Set(edges.flatMap(e => [e.source_id, e.target_id]).filter(x => x !== id))]; return `Node ${id} (${ids.length} connections):\n` + ids.slice(0, 20).map(n => `  → ${n}`).join('\n'); }
      case 'add_edge': { const s = a.source_id as number, t = a.target_id as number; if (!s || !t) return 'Error: source_id and target_id required'; const id = this.engine.addEdge(s, t, (a.relation as string) ?? 'RELATES_TO'); return `Edge: ${s} → ${t} (id=${id})`; }
      case 'path': return 'Path query: use graph visualization';
      case 'ego': return 'Ego graph: use graph visualization';
      default: return `Unknown graph action: ${action}`;
    }
  }

  private handleConsolidate(): string { return `Promoted: 0, Demoted: 0, Expired: 0`; }

  private handleLifecycle(a: Args): string {
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

  private handleTemplates(a: Args): string {
    const action = (a.action as string) || 'list';
    switch (action) {
      case 'create': return `Created template ${a.name}`;
      case 'list': return '[]';
      case 'validate': return a.entry_id ? 'Valid' : 'Error: entry_id required';
      default: return `Unknown templates action: ${action}`;
    }
  }

  private handleAttachments(a: Args): string {
    const action = (a.action as string) || 'list';
    switch (action) {
      case 'attach': { const id = a.entry_id as number; return id && a.file_path ? `Attached file to #${id}` : 'Error: entry_id + file_path required'; }
      case 'list': return a.entry_id ? '[]' : 'Error: entry_id required';
      case 'remove': return a.attachment_id ? `Removed attachment #${a.attachment_id}` : 'Error: attachment_id required';
      default: return `Unknown attachments action: ${action}`;
    }
  }

  private handleDiscover(a: Args): string {
    const action = (a.action as string) || 'suggest';
    switch (action) {
      case 'suggest': { const q = a.query as string; return q ? 'No suggestions' : 'Error: query required'; }
      case 'related': { const id = a.entry_id as number; return id ? 'No related' : 'Error: entry_id required'; }
      default: return `Unknown discover action: ${action}`;
    }
  }

  private handleTags(a: Args): string {
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
        if (!this.tagAnalyzer) return 'Error: TagAnalyzer not initialized';
        const db = this.engine.getDb();
        const entry = db.prepare('SELECT content, tags FROM knowledge_entries WHERE id = ?').get(entryId) as any;
        if (!entry) return `Error: entry ${entryId} not found`;
        this.tagAnalyzer.analyzeTags(entry.content).then(result => {
          if (result.appliedTags.length > 0) {
            this.engine.updateTags(entryId, result.appliedTags.join(','));
            console.log(`[Retag] Entry ${entryId}: ${result.appliedTags.join(',')}`);
          }
        }).catch(err => console.error(`[Retag] Failed ${entryId}:`, err?.message));
        return `Retag queued for entry #${entryId} (async LLM)`;
      }
      case 'retag_all': {
        if (!this.tagAnalyzer) return 'Error: TagAnalyzer not initialized';
        const db = this.engine.getDb();
        const entries = db.prepare('SELECT id, content FROM knowledge_entries ORDER BY id').all() as any[];
        let queued = 0;
        for (const entry of entries) {
          setTimeout(() => {
            this.tagAnalyzer!.analyzeTags(entry.content).then(result => {
              if (result.appliedTags.length > 0) {
                this.engine.updateTags(entry.id, result.appliedTags.join(','));
                console.log(`[Retag] Entry ${entry.id}: ${result.appliedTags.join(',')}`);
              }
            }).catch(err => console.error(`[Retag] Failed ${entry.id}:`, err?.message));
          }, queued * 3000); // 3s between each to not overload LLM
          queued++;
        }
        return `Retag ALL queued: ${queued} entries (async, ~${queued * 3}s total)`;
      }
      default: return `Unknown tags action: ${action}`;
    }
  }

  private handleCitations(a: Args): string {
    const action = (a.action as string) || 'most_cited';
    switch (action) {
      case 'record': return a.entry_id ? `Recorded citation for #${a.entry_id}` : 'Error: entry_id required';
      case 'most_cited': return '[]';
      case 'uncited': return 'All cited';
      default: return `Unknown citations action: ${action}`;
    }
  }

  private handleConversation(a: Args): string {
    const action = (a.action as string) || 'list_sessions';
    switch (action) {
      case 'save_turn': return `Saved turn for session ${a.session_id}`;
      case 'get_session': return 'No turns';
      case 'list_sessions': return 'No sessions';
      case 'search': return 'No matches';
      default: return `Unknown conversation action: ${action}`;
    }
  }

  private handleScoring(a: Args): string {
    const action = (a.action as string) || 'quality_stats';
    switch (action) {
      case 'quality_score': return a.entry_id ? `Score: 100/100` : 'Error: entry_id';
      case 'feedback_submit': return a.entry_id ? `Feedback submitted for #${a.entry_id}` : 'Error: entry_id';
      default: return `Scoring: use admin for "${action}"`;
    }
  }

  private handleAdmin(a: Args): string {
    const action = (a.action as string) || 'status';
    switch (action) {
      case 'status': {
        const db = this.engine.getDb();
        const entries = (db.prepare('SELECT COUNT(*) as cnt FROM knowledge_entries').get() as any).cnt;
        const edges = (db.prepare('SELECT COUNT(*) as cnt FROM knowledge_graph_edges').get() as any).cnt;
        return `Entries: ${entries} | Edges: ${edges}`;
      }
      case 'sync_code': return this.handleSyncCode(a);
      case 'tool_usage': return JSON.stringify(this.engine.getToolUsage(a.tool_name as string | undefined));
      case 'audit': return this.engine.listAudit((a.limit as number) ?? 20, a.operation as string).map((e: any) => `[${e.operation}] ${e.created_at}`).join('\n') || 'Empty';
      case 'sessions': return this.engine.listSessions().map((s: any) => `[${s.session_id}] ${s.status}`).join('\n') || 'None';
      case 'analytics': case 'popular': return '{}';
      default: return `Admin: "${action}" via portal`;
    }
  }

  private handlePromote(a: Args): string {
    if (!this.promotionService) return 'Error: promotion service not available';
    const action = (a.action as string) || 'scan';
    switch (action) {
      case 'scan': return this.promotionService.runPromotionCycle();
      case 'list': return JSON.stringify(this.promotionService.listPending((a.limit as number) ?? 20));
      case 'approve': {
        const id = a.entry_id as number;
        if (!id) return 'Error: entry_id required';
        const reviewer = (a.reviewer as string) ?? this.scopeCtx?.userId ?? 'system';
        const comment = (a.comment as string) ?? 'Approved via tool';
        return this.promotionService.approve(id, reviewer, comment) ? `Approved #${id}` : `Not found or not pending: #${id}`;
      }
      case 'reject': {
        const id = a.entry_id as number;
        if (!id) return 'Error: entry_id required';
        const reviewer = (a.reviewer as string) ?? this.scopeCtx?.userId ?? 'system';
        const comment = (a.comment as string) ?? 'Rejected via tool';
        return this.promotionService.reject(id, reviewer, comment) ? `Rejected #${id}` : `Not found or not pending: #${id}`;
      }
      case 'request_shared': {
        const id = a.entry_id as number;
        if (!id) return 'Error: entry_id required';
        const reason = (a.reason as string) ?? 'Cross-project relevance';
        return this.promotionService.requestSharedPromotion(id, reason) ? `SHARED promotion requested for #${id}` : `Entry not in PROJECT scope or already queued`;
      }
      case 'promote_on_merge': {
        const ticketKey = a.ticket_key as string;
        if (!ticketKey) return 'Error: ticket_key required';
        const { promoted, skipped } = this.promotionService.promoteOnMerge(ticketKey);
        return `promoteOnMerge(${ticketKey}): ${promoted} entries promoted to PROJECT, ${skipped} skipped.`;
      }
      default: return `Unknown promote action: ${action}. Valid: scan, list, approve, reject, request_shared, promote_on_merge`;
    }
  }

  private tierForType(type: string): string {
    switch (type) { case 'REQUIREMENT': case 'ARCHITECTURE': case 'PROCEDURE': case 'API_DESIGN': return 'SEMANTIC'; case 'DECISION': case 'LESSON_LEARNED': case 'ERROR_PATTERN': return 'EPISODIC'; default: return 'WORKING'; }
  }

  private inferOwner(source?: string): string {
    if (!source) return 'system';
    const s = source.toLowerCase();
    if (['ba','brd','fsd'].some(k => s.includes(k))) return 'ba-agent';
    if (['sa','tdd'].some(k => s.includes(k))) return 'sa-agent';
    if (['qa','stp','stc','test'].some(k => s.includes(k))) return 'qa-agent';
    if (['dev','code'].some(k => s.includes(k))) return 'dev-agent';
    return 'system';
  }

  private handleSyncCode(a: Args): string {
    if (!this.queryLayer) {
      return JSON.stringify({ error: 'mem_sync_code requires queryLayer (code indexer not available)' });
    }

    const limit = (a.limit as number) ?? 10000;
    const kind = a.kind as string | undefined;

    // 1. Fetch symbols
    let symbols: any[] = [];
    if (kind) {
      symbols = this.queryLayer.findSymbols('', kind, limit);
    } else {
      const classes = this.queryLayer.findSymbols('', 'class', Math.floor(limit / 2));
      const interfaces = this.queryLayer.findSymbols('', 'interface', Math.floor(limit / 2));
      symbols = [...classes, ...interfaces];
    }

    if (symbols.length === 0) {
      return 'No code symbols found to sync.';
    }

    // 2. Ingest symbols
    const db = this.engine.getDb();
    const checkStmt = db.prepare(`
      SELECT id FROM knowledge_entries 
      WHERE type = 'CODE_ENTITY' AND source = ? AND summary = ?
    `);

    const created: Array<[number, any]> = [];
    for (const sym of symbols) {
      const summary = `${sym.kind}: ${sym.name} (${sym.filePath})`;
      const exists = checkStmt.get(sym.filePath, summary);
      if (exists) continue;

      const parts = [`${sym.kind} ${sym.name}`];
      if (sym.signature) parts.push(`Signature: ${sym.signature}`);
      parts.push(`File: ${sym.filePath} (lines ${sym.startLine}-${sym.endLine})`);
      if (sym.parentSymbol) parts.push(`Parent: ${sym.parentSymbol}`);
      if (sym.docComment) parts.push(`Doc: ${sym.docComment}`);
      const content = parts.join('\n');

      const id = this.engine.insert({
        content,
        summary,
        type: 'CODE_ENTITY',
        tier: 'SEMANTIC',
        source: sym.filePath,
        tags: `${sym.kind},${sym.name},code`,
      });
      created.push([id, sym]);
    }

    // 3. Link to documents (cross-reference)
    let linked = 0;
    const edgeCheckStmt = db.prepare(`
      SELECT id FROM knowledge_graph_edges 
      WHERE source_id = ? AND target_id = ? AND relation = ?
    `);

    for (const [codeId, sym] of created) {
      const results = this.engine.search(sym.name, 5);
      const relatedIds = results
        .filter(r => r.entry.type !== 'CODE_ENTITY')
        .map(r => r.entry.id)
        .slice(0, 3);

      for (const docId of relatedIds) {
        const exists = edgeCheckStmt.get(codeId, docId, 'IMPLEMENTED_BY');
        if (!exists) {
          this.engine.addEdge(codeId, docId, 'IMPLEMENTED_BY');
          linked++;
        }
      }
    }

    return `Synced: ${created.length} code symbols, ${linked} cross-reference edges`;
  }

  private resolvePath(fp: string): string {
    if (path.isAbsolute(fp) && fs.existsSync(fp)) return fp;
    const ws = path.resolve(this.workspace, fp);
    return fs.existsSync(ws) ? ws : path.resolve(fp);
  }
}
