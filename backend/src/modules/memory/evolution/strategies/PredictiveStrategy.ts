/**
 * PredictiveStrategy — trend-based predictive scoring.
 * Analyzes recent outcomes to boost or penalize entries
 * based on weighted recency of success/failure patterns.
 */

import type { DatabaseAdapter } from '../../../../database/adapters/DatabaseAdapter.js';
import type { KnowledgeEntry } from '../../models.js';
import type { ScoringStrategy, ScoreBreakdown, ScoringContext } from '../models.js';

const MAX_OUTCOMES = 10;

interface OutcomeRow {
  outcome: string;
}

export class PredictiveStrategy implements ScoringStrategy {
  readonly name = 'predictive';
  private readonly adapter: DatabaseAdapter;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  apply(
    entry: KnowledgeEntry,
    breakdown: ScoreBreakdown,
    ctx: ScoringContext,
  ): void {
    if (!ctx.enablePredictive) return;

    const outcomes = this.getRecentOutcomes(entry.id);
    if (outcomes.length === 0) return;

    breakdown.predictive_score = this.computeTrend(outcomes);
  }

  private getRecentOutcomes(entryId: number): OutcomeRow[] {
    return this.adapter.all<OutcomeRow>(
      `SELECT outcome FROM entry_outcomes
       WHERE entry_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [entryId, MAX_OUTCOMES],
    );
  }

  private computeTrend(outcomes: OutcomeRow[]): number {
    const n = outcomes.length;
    let weightedSum = 0;
    let weightTotal = 0;

    for (let i = 0; i < n; i++) {
      const weight = (n - i) / n;
      const value = this.outcomeValue(outcomes[i].outcome);
      weightedSum += weight * value;
      weightTotal += weight;
    }

    const ratio = weightedSum / weightTotal;
    return ratio - 0.5;
  }

  private outcomeValue(outcome: string): number {
    if (outcome === 'success') return 1.0;
    if (outcome === 'partial') return 0.5;
    return 0.0;
  }
}
