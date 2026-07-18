/**
 * MemoryEngine — facade for the KB Memory system.
 * Single entry point for all memory operations in the backend.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type {
  KnowledgeEntry, SearchResult,
  KBScope, ScopeContext, ToolUsageRow,
} from '../models.js';
import type { ProjectContext, ScopeFilter } from '../ProjectContext.js';
import type { CompositeScoreOptions } from '../evolution/models.js';
import { buildReadFilter } from '../IsolationLayer.js';
import { CompositeScorer } from '../evolution/CompositeScorer.js';
import { MemoryEngineCrud } from './crud.js';

export class MemoryEngine extends MemoryEngineCrud {
  private currentSessionId: string | null = null;
  private compositeScorer: CompositeScorer;

  constructor(adapter: DatabaseAdapter) {
    super(adapter);
    this.compositeScorer = new CompositeScorer(adapter);
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
    return this.adapter.all<KnowledgeEntry>(
      `SELECT * FROM knowledge_entries ${where} ORDER BY created_at DESC LIMIT ?`,
      params,
    );
  }

  search(query: string, limit = 10, tier?: string, type?: string, scopeCtx?: ScopeContext): SearchResult[] {
    const clauses: string[] = [
      'ke.archived = 0',
      `(ke.expires_at IS NULL OR ke.expires_at >= ${this.dialect.now()})`,
    ];
    const params: unknown[] = [];
    if (tier) { clauses.push('ke.tier = ?'); params.push(tier); }
    if (type) { clauses.push('ke.type = ?'); params.push(type); }
    if (scopeCtx) {
      clauses.push(this.buildScopeClause(scopeCtx, 'ke'));
      params.push(...this.buildScopeParams(scopeCtx));
    }

    const engine = this.adapter.getEngine();

    if (engine === 'sqlite') {
      const ftsQuery = query.replace(/[^\w\s*":.]/g, ' ').trim() || '*';
      const sql = `SELECT ke.*, f.rank FROM
        (SELECT rowid, rank FROM knowledge_fts WHERE knowledge_fts MATCH ?) f
        JOIN knowledge_entries ke ON f.rowid = ke.id
        WHERE ${clauses.join(' AND ')}
        ORDER BY f.rank LIMIT ?`;
      try {
        const rows = this.adapter.all<any>(sql, [ftsQuery, ...params, limit]);
        return this.applyCompositeScoring(rows);
      } catch { return []; }
    }

    if (engine === 'postgresql') {
      const sanitized = query.replace(/[^\w\s*":.]/g, ' ').trim();
      if (!sanitized) {
        return this.findFiltered(tier, type, limit, scopeCtx).map(e => ({ entry: e, score: 0, matchType: 'all' }));
      }
      const sql = `SELECT ke.*, ts_rank(ke.tsvector_content, plainto_tsquery('english', ?)) as rank
        FROM knowledge_entries ke
        WHERE ke.tsvector_content @@ plainto_tsquery('english', ?) AND ${clauses.join(' AND ')}
        ORDER BY rank DESC LIMIT ?`;
      try {
        const rows = this.adapter.all<any>(sql, [sanitized, sanitized, ...params, limit]);
        return this.applyCompositeScoring(rows);
      } catch { return []; }
    }

    const sql = `SELECT ke.*, MATCH(ke.content, ke.summary) AGAINST(? IN NATURAL LANGUAGE MODE) as rank
      FROM knowledge_entries ke
      WHERE MATCH(ke.content, ke.summary) AGAINST(? IN NATURAL LANGUAGE MODE) AND ${clauses.join(' AND ')}
      ORDER BY rank DESC LIMIT ?`;
    try {
      const rows = this.adapter.all<any>(sql, [query, query, ...params, limit]);
      return this.applyCompositeScoring(rows);
    } catch { return []; }
  }

  private applyCompositeScoring(rows: any[]): SearchResult[] {
    try {
      const options = this.readScoringOptions();
      const scored = rows.map(row => {
        const { rank, ...entry } = row;
        const ftsRank = -rank;
        const { score, breakdown } = this.compositeScorer.computeCompositeScore(
          entry as KnowledgeEntry,
          ftsRank,
          options,
        );
        return {
          entry: entry as KnowledgeEntry,
          score,
          matchType: 'composite',
          breakdown,
        };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored;
    } catch {
      return rows.map(row => {
        const { rank, ...entry } = row;
        return { entry: entry as KnowledgeEntry, score: -rank, matchType: 'fts' };
      });
    }
  }

  private readScoringOptions(): CompositeScoreOptions {
    try {
      const row = this.adapter.get<{ value: string }>(
        `SELECT value FROM decay_config WHERE key = 'enable_predictive'`,
      );
      return { enablePredictive: row?.value === 'true' };
    } catch {
      return {};
    }
  }

  // ─── Sessions ─────────────────────────────────────────────────────
  startSession(agentName?: string): string {
    const sid = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.adapter.run(
      `INSERT INTO memory_sessions (session_id, agent_name) VALUES (?, ?)`,
      [sid, agentName ?? null],
    );
    this.currentSessionId = sid;
    this.auditLog('SESSION_START', undefined, sid);
    return sid;
  }

  endSession(): void {
    if (!this.currentSessionId) return;
    this.adapter.run(
      `UPDATE memory_sessions SET ended_at = ${this.dialect.now()}, status = 'ended' WHERE session_id = ?`,
      [this.currentSessionId],
    );
    this.auditLog('SESSION_END', undefined, this.currentSessionId);
    this.currentSessionId = null;
  }

  listSessions(limit = 20): any[] {
    return this.adapter.all<any>(
      'SELECT * FROM memory_sessions ORDER BY started_at DESC LIMIT ?',
      [limit],
    );
  }

  // ─── Audit ────────────────────────────────────────────────────────

  auditLog(operation: string, entryId?: number, sessionId?: string): void {
    this.adapter.run(
      `INSERT INTO memory_audit (operation, entry_id, session_id) VALUES (?, ?, ?)`,
      [operation, entryId ?? null, sessionId ?? this.currentSessionId ?? null],
    );
  }

  listAudit(limit = 20, operation?: string): any[] {
    if (operation) {
      return this.adapter.all<any>(
        'SELECT * FROM memory_audit WHERE operation = ? ORDER BY created_at DESC LIMIT ?',
        [operation, limit],
      );
    }
    return this.adapter.all<any>(
      'SELECT * FROM memory_audit ORDER BY created_at DESC LIMIT ?',
      [limit],
    );
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
      this.adapter.run(
        `UPDATE knowledge_entries SET scope = ?, project_id = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
        [targetScope, projectId, entryId],
      );
    } else {
      this.adapter.run(
        `UPDATE knowledge_entries SET scope = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
        [targetScope, entryId],
      );
    }

    this.adapter.run(
      `INSERT INTO consolidation_log (entry_id, from_tier, to_tier, reason) VALUES (?, ?, ?, ?)`,
      [entryId, currentScope, targetScope, `Promoted: ${currentScope} → ${targetScope}`],
    );

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

    this.adapter.run(
      `UPDATE knowledge_entries SET scope = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
      [targetScope, entryId],
    );

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
    this.adapter.run(`
      INSERT INTO tool_usage (tool_name, call_count, last_called_at)
      VALUES (?, 1, ${this.dialect.now()})
      ON CONFLICT(tool_name) DO UPDATE SET
        call_count = call_count + 1,
        last_called_at = ${this.dialect.now()}
    `, [toolName]);
  }

  getToolUsage(toolName?: string): ToolUsageRow[] {
    return (toolName
      ? this.adapter.all<ToolUsageRow>(
          'SELECT tool_name, call_count, last_called_at FROM tool_usage WHERE tool_name = ?',
          [toolName],
        )
      : this.adapter.all<ToolUsageRow>(
          'SELECT tool_name, call_count, last_called_at FROM tool_usage ORDER BY call_count DESC',
        ));
  }
}
