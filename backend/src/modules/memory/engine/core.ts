/**
 * MemoryEngine — facade for the KB Memory system.
 * Single entry point for all memory operations in the backend.
 */

import Database from 'better-sqlite3';
import type {
  KnowledgeEntry, SearchResult,
  KBScope, ScopeContext, ToolUsageRow,
} from '../models.js';
import type { ProjectContext, ScopeFilter } from '../ProjectContext.js';
import { buildReadFilter } from '../IsolationLayer.js';
import { MemoryEngineCrud } from './crud.js';

export class MemoryEngine extends MemoryEngineCrud {
  private currentSessionId: string | null = null;

  constructor(db: Database.Database) {
    super(db);
  }

  getSessionId(): string | null { return this.currentSessionId; }

  // ─── FTS Search ───────────────────────────────────────────────────

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

  search(query: string, limit = 10, tier?: string, type?: string, scopeCtx?: ScopeContext): SearchResult[] {
    const ftsQuery = query.replace(/[^\w\s*":.]/g, ' ').trim() || '*';
    // SA4E-31: isolate MATCH in a subquery so the scope filter (incl. EXISTS
    // sub-select for SHARED grants) does not break FTS index usage.
    const clauses: string[] = ['ke.archived = 0'];
    const params: unknown[] = [ftsQuery];
    if (tier) { clauses.push('ke.tier = ?'); params.push(tier); }
    if (type) { clauses.push('ke.type = ?'); params.push(type); }
    if (scopeCtx) {
      clauses.push(this.buildScopeClause(scopeCtx, 'ke'));
      params.push(...this.buildScopeParams(scopeCtx));
    }
    params.push(limit);
    const sql = `SELECT ke.*, f.rank FROM
      (SELECT rowid, rank FROM knowledge_fts WHERE knowledge_fts MATCH ?) f
      JOIN knowledge_entries ke ON f.rowid = ke.id
      WHERE ${clauses.join(' AND ')}
      ORDER BY f.rank LIMIT ?`;
    try {
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => {
        const { rank, ...entry } = row;
        return { entry: entry as KnowledgeEntry, score: -rank, matchType: 'fts' };
      });
    } catch { return []; }
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

  promoteEntry(entryId: number, targetScope: KBScope, projectId?: string): boolean {
    const entry = this.findById(entryId);
    if (!entry) return false;

    const validTransitions: Record<string, KBScope[]> = {
      USER: ['PROJECT'],
      PROJECT: ['SHARED'],
      SHARED: [],
    };

    const currentScope = (entry.scope ?? 'USER') as KBScope;
    if (!validTransitions[currentScope]?.includes(targetScope)) return false;

    if (currentScope === 'USER' && targetScope === 'PROJECT' && projectId) {
      this.db.prepare(
        `UPDATE knowledge_entries SET scope = ?, project_id = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(targetScope, projectId, entryId);
    } else {
      this.db.prepare(
        `UPDATE knowledge_entries SET scope = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(targetScope, entryId);
    }

    this.db.prepare(
      `INSERT INTO consolidation_log (entry_id, from_tier, to_tier, reason)
       VALUES (?, ?, ?, ?)`,
    ).run(entryId, currentScope, targetScope, `Promoted: ${currentScope} → ${targetScope}`);

    this.auditLog('PROMOTE', entryId);
    return true;
  }

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

  // SA4E-31: delegate to IsolationLayer (single source of truth) for scope isolation.
  private scopeFilter(ctx: ScopeContext, tableAlias?: string): ScopeFilter {
    const pctx = { projectId: ctx.projectId ?? '', userId: ctx.userId, createdAt: '' } as ProjectContext;
    return buildReadFilter(pctx, tableAlias);
  }

  buildScopeClause(ctx: ScopeContext, tableAlias?: string): string {
    return this.scopeFilter(ctx, tableAlias).clause;
  }

  buildScopeParams(ctx: ScopeContext): unknown[] {
    return [...this.scopeFilter(ctx).params];
  }

  // ─── Tool Usage (SA4E-18) ─────────────────────────────────────────

  incrementToolUsage(toolName: string): void {
    this.db.prepare(`
      INSERT INTO tool_usage (tool_name, call_count, last_called_at)
      VALUES (?, 1, datetime('now'))
      ON CONFLICT(tool_name) DO UPDATE SET
        call_count = call_count + 1,
        last_called_at = datetime('now')
    `).run(toolName);
  }

  getToolUsage(toolName?: string): ToolUsageRow[] {
    return (toolName
      ? this.db.prepare(
          'SELECT tool_name, call_count, last_called_at FROM tool_usage WHERE tool_name = ?'
        ).all(toolName)
      : this.db.prepare(
          'SELECT tool_name, call_count, last_called_at FROM tool_usage ORDER BY call_count DESC'
        ).all()) as ToolUsageRow[];
  }
}
