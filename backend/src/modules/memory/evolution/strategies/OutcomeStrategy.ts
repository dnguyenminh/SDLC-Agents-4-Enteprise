/**
 * OutcomeStrategy — applies Bayesian outcome factor to scoring breakdown.
 * Queries entry_outcomes directly for sync scoring (SA4E-53: uses sync adapter fallback).
 * Note: ScoringStrategy.apply() is synchronous — uses adapter's sync get() for SQLite
 * or falls back to default 0.5 for PostgreSQL where sync access is unavailable.
 */

import type { DatabaseAdapter } from '../../../../database/adapters/DatabaseAdapter.js';
import type { KnowledgeEntry } from '../../models.js';
import type { ScoringStrategy, ScoreBreakdown, ScoringContext } from '../models.js';

export class OutcomeStrategy implements ScoringStrategy {
  readonly name = 'outcome';
  private readonly adapter: DatabaseAdapter;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  apply(
    entry: KnowledgeEntry,
    breakdown: ScoreBreakdown,
    _ctx: ScoringContext,
  ): void {
    // SA4E-53: ScoringStrategy.apply() is sync — use adapter sync fallback.
    // For SQLite: sync get() works. For PostgreSQL: falls back to 0.5 (no sync ops).
    try {
      const rows = (this.adapter as any).all?.(
        `SELECT outcome, COUNT(*) as cnt FROM entry_outcomes WHERE entry_id = ? GROUP BY outcome`,
        [entry.id],
      ) as Array<{ outcome: string; cnt: number }> | undefined;

      if (!rows || rows.length === 0) {
        breakdown.outcome_factor = 0.5;
        return;
      }

      let successes = 0;
      let total = 0;
      for (const row of rows) {
        total += row.cnt;
        if (row.outcome === 'success') successes += row.cnt;
        else if (row.outcome === 'partial') successes += row.cnt * 0.5;
      }

      breakdown.outcome_factor = total === 0 ? 0.5 : (successes + 1) / (total + 2);
    } catch {
      // PostgreSQL or any failure — use neutral Laplace prior
      breakdown.outcome_factor = 0.5;
    }
  }
}
