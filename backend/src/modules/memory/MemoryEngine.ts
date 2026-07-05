/**
 * MemoryEngine — facade for the KB Memory system.
 * Single entry point for all memory operations in the backend.
 */

import Database from 'better-sqlite3';
import type {
  KnowledgeEntry, SearchResult, GraphEdge,
  TierStats, ConsolidationResult, ConversationTurn, ConversationSession,
  KBScope, ScopeContext,
} from './models.js';

export class MemoryEngine {
  private readonly db: Database.Database;
  private currentSessionId: string | null = null;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getDb(): Database.Database { return this.db; }
  getSessionId(): string | null { return this.currentSessionId; }

  // ─── Knowledge CRUD ───────────────────────────────────────────────

  insert(entry: Partial<KnowledgeEntry>): number {
    const stmt = this.db.prepare(`
      INSERT INTO knowledge_entries
      (content, summary, type, tier, scope, user_id, source, source_ref, tags, confidence, agent_name, owner)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      entry.content, entry.summary, entry.type,
      entry.tier ?? 'WORKING', entry.scope ?? 'USER',
      entry.user_id ?? null, entry.source ?? null,
      entry.source_ref ?? null, entry.tags ?? '',
      entry.confidence ?? 1.0, entry.agent_name ?? null,
      entry.owner ?? null,
    );
    return result.lastInsertRowid as number;
  }

  findById(id: number): KnowledgeEntry | undefined {
    return this.db.prepare('SELECT * FROM knowledge_entries WHERE id = ?')
      .get(id) as KnowledgeEntry | undefined;
  }

  findFiltered(tier?: string, type?: string, limit = 20, scopeCtx?: ScopeContext): KnowledgeEntry[] {
    const clauses: string[] = ['archived = 0'];
    const params: unknown[] = [];
    if (tier) { clauses.push('tier = ?'); params.push(tier); }
    if (type) { clauses.push('type = ?'); params.push(type); }
    if (scopeCtx) {
      clauses.push(this.buildScopeClause(scopeCtx));
      params.push(...this.buildScopeParams(scopeCtx));
    }
    const where = `WHERE ${clauses.join(' AND ')}`;
    params.push(limit);
    return this.db.prepare(
      `SELECT * FROM knowledge_entries ${where} ORDER BY created_at DESC LIMIT ?`
    ).all(...params) as KnowledgeEntry[];
  }

  deleteEntry(id: number): void {
    this.db.prepare('DELETE FROM knowledge_entries WHERE id = ?').run(id);
  }

  updateTags(id: number, tags: string): void {
    this.db.prepare('UPDATE knowledge_entries SET tags = ?, updated_at = datetime(\'now\') WHERE id = ?').run(tags, id);
  }

  recordAccess(id: number): void {
    this.db.prepare(`
      UPDATE knowledge_entries
      SET access_count = access_count + 1, last_accessed_at = datetime('now')
      WHERE id = ?
    `).run(id);
  }

  // ─── FTS Search ───────────────────────────────────────────────────

  search(query: string, limit = 10, tier?: string, type?: string, scopeCtx?: ScopeContext): SearchResult[] {
    const ftsQuery = query.replace(/[^\w\s*":.]/g, ' ').trim() || '*';
    const clauses: string[] = ['knowledge_fts MATCH ?', 'ke.archived = 0'];
    const params: unknown[] = [ftsQuery];
    if (tier) { clauses.push('ke.tier = ?'); params.push(tier); }
    if (type) { clauses.push('ke.type = ?'); params.push(type); }
    if (scopeCtx) {
      clauses.push(this.buildScopeClause(scopeCtx, 'ke'));
      params.push(...this.buildScopeParams(scopeCtx));
    }
    params.push(limit);
    const sql = `SELECT ke.*, rank FROM knowledge_fts
      JOIN knowledge_entries ke ON knowledge_fts.rowid = ke.id
      WHERE ${clauses.join(' AND ')}
      ORDER BY rank LIMIT ?`;
    try {
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => {
        const { rank, ...entry } = row;
        return { entry: entry as KnowledgeEntry, score: -rank, matchType: 'fts' };
      });
    } catch { return []; }
  }

  // ─── Graph Operations ─────────────────────────────────────────────

  addEdge(sourceId: number, targetId: number, relation = 'RELATES_TO', weight = 1.0): number {
    const result = this.db.prepare(
      `INSERT INTO knowledge_graph_edges (source_id, target_id, relation, weight) VALUES (?, ?, ?, ?)`
    ).run(sourceId, targetId, relation, weight);
    return result.lastInsertRowid as number;
  }

  getNeighbors(nodeId: number): GraphEdge[] {
    return this.db.prepare(
      'SELECT * FROM knowledge_graph_edges WHERE source_id = ? OR target_id = ?'
    ).all(nodeId, nodeId) as GraphEdge[];
  }

  countEdges(): number {
    return (this.db.prepare('SELECT COUNT(*) as cnt FROM knowledge_graph_edges').get() as any).cnt;
  }

  // ─── Sessions ─────────────────────────────────────────────────────

  startSession(agentName?: string): string {
    const sid = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.db.prepare(
      `INSERT INTO memory_sessions (session_id, agent_name) VALUES (?, ?)`
    ).run(sid, agentName ?? null);
    this.currentSessionId = sid;
    this.auditLog('SESSION_START', undefined, sid);
    return sid;
  }

  endSession(): void {
    if (!this.currentSessionId) return;
    this.db.prepare(
      `UPDATE memory_sessions SET ended_at = datetime('now'), status = 'ended' WHERE session_id = ?`
    ).run(this.currentSessionId);
    this.auditLog('SESSION_END', undefined, this.currentSessionId);
    this.currentSessionId = null;
  }

  listSessions(limit = 20): any[] {
    return this.db.prepare(
      'SELECT * FROM memory_sessions ORDER BY started_at DESC LIMIT ?'
    ).all(limit) as any[];
  }

  // ─── Audit ────────────────────────────────────────────────────────

  auditLog(operation: string, entryId?: number, sessionId?: string): void {
    this.db.prepare(
      `INSERT INTO memory_audit (operation, entry_id, session_id) VALUES (?, ?, ?)`
    ).run(operation, entryId ?? null, sessionId ?? this.currentSessionId ?? null);
  }

  listAudit(limit = 20, operation?: string): any[] {
    if (operation) {
      return this.db.prepare(
        'SELECT * FROM memory_audit WHERE operation = ? ORDER BY created_at DESC LIMIT ?'
      ).all(operation, limit) as any[];
    }
    return this.db.prepare(
      'SELECT * FROM memory_audit ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as any[];
  }

  // ─── Scope Operations ─────────────────────────────────────────────

  /**
   * Promote entry from USER → PROJECT or PROJECT → SHARED.
   * Validates scope transition order.
   */
  promoteEntry(entryId: number, targetScope: KBScope): boolean {
    const entry = this.findById(entryId);
    if (!entry) return false;

    const validTransitions: Record<string, KBScope[]> = {
      USER: ['PROJECT'],
      PROJECT: ['SHARED'],
      SHARED: [],
    };

    const currentScope = (entry.scope ?? 'USER') as KBScope;
    if (!validTransitions[currentScope]?.includes(targetScope)) return false;

    this.db.prepare(
      `UPDATE knowledge_entries SET scope = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(targetScope, entryId);

    this.db.prepare(
      `INSERT INTO consolidation_log (entry_id, from_tier, to_tier, reason)
       VALUES (?, ?, ?, ?)`
    ).run(entryId, currentScope, targetScope, `Promoted: ${currentScope} → ${targetScope}`);

    this.auditLog('PROMOTE', entryId);
    return true;
  }

  /**
   * Demote entry from SHARED → PROJECT or PROJECT → USER.
   */
  demoteEntry(entryId: number, targetScope: KBScope): boolean {
    const entry = this.findById(entryId);
    if (!entry) return false;

    const validTransitions: Record<string, KBScope[]> = {
      SHARED: ['PROJECT'],
      PROJECT: ['USER'],
      USER: [],
    };

    const currentScope = (entry.scope ?? 'USER') as KBScope;
    if (!validTransitions[currentScope]?.includes(targetScope)) return false;

    this.db.prepare(
      `UPDATE knowledge_entries SET scope = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(targetScope, entryId);

    this.auditLog('DEMOTE', entryId);
    return true;
  }

  /**
   * Build SQL WHERE clause for scope-based visibility.
   * User sees: their own USER entries + all PROJECT entries + all SHARED entries.
   */
  buildScopeClause(ctx: ScopeContext, tableAlias?: string): string {
    const prefix = tableAlias ? `${tableAlias}.` : '';
    return `(${prefix}scope IN ('PROJECT', 'SHARED') OR (${prefix}scope = 'USER' AND ${prefix}user_id = ?))`;
  }

  buildScopeParams(ctx: ScopeContext): unknown[] {
    return [ctx.userId];
  }
}
