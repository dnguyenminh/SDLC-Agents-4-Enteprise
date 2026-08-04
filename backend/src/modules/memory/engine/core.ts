/**
 * MemoryEngine — facade for the KB Memory system.
 * Single entry point for all memory operations in the backend.
 * SA4E-53: converted to async API for PostgreSQL compatibility.
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
  private cachedScoringOptions: CompositeScoreOptions | null = null;

  constructor(adapter: DatabaseAdapter) {
    super(adapter);
    this.compositeScorer = new CompositeScorer(adapter);
  }

  getSessionId(): string | null { return this.currentSessionId; }

  // ─── FTS Search ───────────────────────────────────────────────────

  async findFiltered(tier?: string, type?: string, limit = 20, scopeCtx?: ScopeContext): Promise<KnowledgeEntry[]> {
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
    return this.adapter.allAsync<KnowledgeEntry>(
      `SELECT * FROM knowledge_entries ${where} ORDER BY created_at DESC LIMIT ?`,
      params,
    );
  }

  async search(query: string, limit = 10, tier?: string, type?: string, scopeCtx?: ScopeContext): Promise<SearchResult[]> {
    const engine = this.adapter.getEngine();
    const clauses: string[] = [
      'ke.archived = 0',
      this.dialect.expiryCheck('ke.expires_at'),
    ];
    const params: unknown[] = [];
    if (tier) { clauses.push('ke.tier = ?'); params.push(tier); }
    if (type) { clauses.push('ke.type = ?'); params.push(type); }
    if (scopeCtx) {
      clauses.push(this.buildScopeClause(scopeCtx, 'ke'));
      params.push(...this.buildScopeParams(scopeCtx));
    }

    if (engine === 'sqlite') {
      const ftsQuery = query.replace(/[^\w\s*":.]/g, ' ').trim() || '*';
      const sql = `SELECT ke.*, f.rank FROM
        (SELECT rowid, rank FROM knowledge_fts WHERE knowledge_fts MATCH ?) f
        JOIN knowledge_entries ke ON f.rowid = ke.id
        WHERE ${clauses.join(' AND ')}
        ORDER BY f.rank LIMIT ?`;
      try {
        const rows = await this.adapter.allAsync<any>(sql, [ftsQuery, ...params, limit]);
        return this.applyCompositeScoring(rows);
      } catch (e) {
        console.warn('[MemoryEngine] search sqlite fts failed', e);
        return [];
      }
    }

    if (engine === 'postgresql') {
      const sanitized = query.replace(/[^\w\s*":.]/g, ' ').trim();
      if (!sanitized) {
        const filtered = await this.findFiltered(tier, type, limit, scopeCtx);
        return filtered.map(e => ({ entry: e, score: 0, matchType: 'all' }));
      }
      const sql = `SELECT ke.*, ts_rank(ke.tsvector_content, plainto_tsquery('english', ?)) as rank
        FROM knowledge_entries ke
        WHERE ke.tsvector_content @@ plainto_tsquery('english', ?) AND ${clauses.join(' AND ')}
        ORDER BY rank DESC LIMIT ?`;
      try {
        const rows = await this.adapter.allAsync<any>(sql, [sanitized, sanitized, ...params, limit]);
        return this.applyCompositeScoring(rows);
      } catch (e) {
        console.warn('[MemoryEngine] search pg fts failed', e);
        return [];
      }
    }

    const sql = `SELECT ke.*, MATCH(ke.content, ke.summary) AGAINST(? IN NATURAL LANGUAGE MODE) as rank
      FROM knowledge_entries ke
      WHERE MATCH(ke.content, ke.summary) AGAINST(? IN NATURAL LANGUAGE MODE) AND ${clauses.join(' AND ')}
      ORDER BY rank DESC LIMIT ?`;
    try {
      const rows = await this.adapter.allAsync<any>(sql, [query, query, ...params, limit]);
      return this.applyCompositeScoring(rows);
    } catch (e) {
      console.warn('[MemoryEngine] search mysql fts failed', e);
      return [];
    }
  }

  private async applyCompositeScoring(rows: any[]): Promise<SearchResult[]> {
    try {
      const options = await this.readScoringOptions();
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
    } catch (e) {
      console.warn('[MemoryEngine] applyCompositeScoring failed', e);
      return rows.map(row => {
        const { rank, ...entry } = row;
        return { entry: entry as KnowledgeEntry, score: -rank, matchType: 'fts' };
      });
    }
  }

  /**
   * Read composite scoring options from `decay_config`.
   * Uses the async adapter API so it works on every engine — PostgresAdapter
   * has no sync fallback (its sync `get()` throws "Use getAsync"), so the
   * previous sync variant crashed every PG search after FTS returned rows.
   */
  private async readScoringOptions(): Promise<CompositeScoreOptions> {
    try {
      // PostgreSQL only supports async — return defaults (non-fatal)
      if (this.adapter.getEngine() === 'postgresql') {
        return this.cachedScoringOptions ?? {};
      }
      const row = (this.adapter as any).get?.(
        `SELECT value FROM decay_config WHERE key = 'enable_predictive'`,
      ) as { value: string } | undefined;
      const opts = { enablePredictive: row?.value === 'true' };
      this.cachedScoringOptions = opts;
      return opts;
    } catch (e) {
      return this.cachedScoringOptions ?? {};
    }
  }

  // ─── Sessions ─────────────────────────────────────────────────────
  async startSession(agentName?: string): Promise<string> {
    const sid = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.adapter.runAsync(
      `INSERT INTO memory_sessions (session_id, agent_name) VALUES (?, ?)`,
      [sid, agentName ?? null],
    );
    this.currentSessionId = sid;
    await this.auditLog('SESSION_START', undefined, sid);
    return sid;
  }

  async endSession(): Promise<void> {
    if (!this.currentSessionId) return;
    await this.adapter.runAsync(
      `UPDATE memory_sessions SET ended_at = ${this.dialect.now()}, status = 'ended' WHERE session_id = ?`,
      [this.currentSessionId],
    );
    await this.auditLog('SESSION_END', undefined, this.currentSessionId);
    this.currentSessionId = null;
  }

  async listSessions(limit = 20): Promise<any[]> {
    return this.adapter.allAsync<any>(
      'SELECT * FROM memory_sessions ORDER BY started_at DESC LIMIT ?',
      [limit],
    );
  }

  // ─── Audit ────────────────────────────────────────────────────────

  async auditLog(operation: string, entryId?: number, sessionId?: string): Promise<void> {
    await this.adapter.runAsync(
      `INSERT INTO memory_audit (operation, entry_id, session_id) VALUES (?, ?, ?)`,
      [operation, entryId ?? null, sessionId ?? this.currentSessionId ?? null],
    );
  }

  async listAudit(limit = 20, operation?: string): Promise<any[]> {
    if (operation) {
      return this.adapter.allAsync<any>(
        'SELECT * FROM memory_audit WHERE operation = ? ORDER BY created_at DESC LIMIT ?',
        [operation, limit],
      );
    }
    return this.adapter.allAsync<any>(
      'SELECT * FROM memory_audit ORDER BY created_at DESC LIMIT ?',
      [limit],
    );
  }

  // ─── Scope Operations ─────────────────────────────────────────────

  async promoteEntry(entryId: number, targetScope: KBScope, projectId?: string): Promise<boolean> {
    const entry = await this.findById(entryId);
    if (!entry) return false;

    const validTransitions: Record<string, KBScope[]> = {
      USER: ['PROJECT'],
      PROJECT: ['SHARED'],
      SHARED: [],
    };

    const currentScope = (entry.scope ?? 'USER') as KBScope;
    if (!validTransitions[currentScope]?.includes(targetScope)) return false;

    if (currentScope === 'USER' && targetScope === 'PROJECT' && projectId) {
      await this.adapter.runAsync(
        `UPDATE knowledge_entries SET scope = ?, project_id = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
        [targetScope, projectId, entryId],
      );
    } else {
      await this.adapter.runAsync(
        `UPDATE knowledge_entries SET scope = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
        [targetScope, entryId],
      );
    }

    await this.adapter.runAsync(
      `INSERT INTO consolidation_log (entry_id, from_tier, to_tier, reason) VALUES (?, ?, ?, ?)`,
      [entryId, currentScope, targetScope, `Promoted: ${currentScope} → ${targetScope}`],
    );

    await this.auditLog('PROMOTE', entryId);
    return true;
  }

  async demoteEntry(entryId: number, targetScope: KBScope): Promise<boolean> {
    const entry = await this.findById(entryId);
    if (!entry) return false;

    const validTransitions: Record<string, KBScope[]> = {
      SHARED: ['PROJECT'],
      PROJECT: ['USER'],
      USER: [],
    };

    const currentScope = (entry.scope ?? 'USER') as KBScope;
    if (!validTransitions[currentScope]?.includes(targetScope)) return false;

    await this.adapter.runAsync(
      `UPDATE knowledge_entries SET scope = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
      [targetScope, entryId],
    );

    await this.auditLog('DEMOTE', entryId);
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

  async incrementToolUsage(toolName: string): Promise<void> {
    await this.adapter.runAsync(`
      INSERT INTO tool_usage (tool_name, call_count, last_called_at)
      VALUES (?, 1, ${this.dialect.now()})
      ON CONFLICT(tool_name) DO UPDATE SET
        call_count = tool_usage.call_count + 1,
        last_called_at = ${this.dialect.now()}
    `, [toolName]);
  }

  async getToolUsage(toolName?: string): Promise<ToolUsageRow[]> {
    return (toolName
      ? this.adapter.allAsync<ToolUsageRow>(
          'SELECT tool_name, call_count, last_called_at FROM tool_usage WHERE tool_name = ?',
          [toolName],
        )
      : this.adapter.allAsync<ToolUsageRow>(
          'SELECT tool_name, call_count, last_called_at FROM tool_usage ORDER BY call_count DESC',
        ));
  }
}
