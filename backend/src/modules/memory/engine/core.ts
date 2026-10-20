/**
 * MemoryEngine (facade) — facade for the KB Memory system.
 * Single entry point for all memory operations in the backend.
 * SA4E-53: converted to async API for PostgreSQL compatibility.
 *
 * Implementation submodules (same directory):
 * - crud.ts                     — CRUD + graph operations (base)
 * - MemoryEngineSessionsAudit.ts — sessions + audit trail
 * - MemoryEngineScopeTools.ts   — scope transitions + tool usage
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type {
  KnowledgeEntry, SearchResult,
  ScopeContext,
} from '../models.js';
import type { CompositeScoreOptions } from '../evolution/models.js';
import { CompositeScorer } from '../evolution/CompositeScorer.js';
import { searchPegaSymbols, mergeDedupResults } from './pega-search.js';
import { MemoryEngineScopeTools } from './MemoryEngineScopeTools.js';

export class MemoryEngine extends MemoryEngineScopeTools {
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

    const legacyResults = await this.searchByEngine(query, clauses, params, limit, tier, type, scopeCtx);

    // SA4E-171: Dual-read — also search symbols_fts for Pega rules
    const pegaResults = await searchPegaSymbols(this.adapter, query, limit, scopeCtx);
    return mergeDedupResults(legacyResults, pegaResults, limit);
  }

  /** Engine-specific FTS query dispatch (sqlite / postgresql / mysql fallback). */
  private async searchByEngine(
    query: string, clauses: string[], params: unknown[], limit: number,
    tier?: string, type?: string, scopeCtx?: ScopeContext,
  ): Promise<SearchResult[]> {
    const engine = this.adapter.getEngine();
    if (engine === 'sqlite') return this.searchSqlite(query, clauses, params, limit);
    if (engine === 'postgresql') return this.searchPostgres(query, clauses, params, limit, tier, type, scopeCtx);
    return this.searchMysql(query, clauses, params, limit);
  }

  private async searchSqlite(
    query: string, clauses: string[], params: unknown[], limit: number,
  ): Promise<SearchResult[]> {
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

  private async searchPostgres(
    query: string, clauses: string[], params: unknown[], limit: number,
    tier?: string, type?: string, scopeCtx?: ScopeContext,
  ): Promise<SearchResult[]> {
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

  private async searchMysql(
    query: string, clauses: string[], params: unknown[], limit: number,
  ): Promise<SearchResult[]> {
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

  private applyCompositeScoring(rows: any[]): SearchResult[] {
    try {
      const options = this.readScoringOptionsSync();
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
   * Sync scoring options read — only called after allAsync returns rows.
   * SA4E-53: scoring config is read via sync path since it's called from applyCompositeScoring
   * which is a synchronous post-processing step on already-fetched rows.
   * TODO: convert to fully async in future if needed.
   */
  private readScoringOptionsSync(): CompositeScoreOptions {
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
    } catch (err) {
      console.debug('[memory-core] Failed to read decay_config, using cached scoring options:', (err as Error).message);
      return this.cachedScoringOptions ?? {};
    }
  }
}
