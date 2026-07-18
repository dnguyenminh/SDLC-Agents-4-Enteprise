/**
 * CompositeScorer — orchestrates multiple scoring strategies
 * to produce a single composite score for search results.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { KnowledgeEntry } from '../models.js';
import type {
  ScoringStrategy,
  ScoreBreakdown,
  ScoringContext,
  CompositeResult,
  CompositeScoreOptions,
} from './models.js';
import { createEmptyBreakdown } from './models.js';
import { TemporalStrategy } from './strategies/TemporalStrategy.js';
import { ConfidenceStrategy } from './strategies/ConfidenceStrategy.js';
import { SupersededStrategy } from './strategies/SupersededStrategy.js';
import { OutcomeStrategy } from './strategies/OutcomeStrategy.js';
import { PredictiveStrategy } from './strategies/PredictiveStrategy.js';

const DEFAULT_HALF_LIFE_DAYS = 30;
const SUPERSEDED_PENALTY = 0.3;

export class CompositeScorer {
  private readonly adapter: DatabaseAdapter;
  private readonly strategies: ScoringStrategy[];

  constructor(adapter: DatabaseAdapter, strategies?: ScoringStrategy[]) {
    this.adapter = adapter;
    this.strategies = strategies ?? [
      new TemporalStrategy(),
      new ConfidenceStrategy(),
      new SupersededStrategy(),
      new OutcomeStrategy(adapter),
      new PredictiveStrategy(adapter),
    ];
  }

  computeCompositeScore(
    entry: KnowledgeEntry,
    ftsRank: number,
    options?: CompositeScoreOptions,
  ): CompositeResult {
    const ctx = this.buildContext(options);
    const breakdown = createEmptyBreakdown(ftsRank);

    for (const strategy of this.strategies) {
      try {
        strategy.apply(entry, breakdown, ctx);
      } catch {
        // Graceful skip — strategy failure does not break scoring
      }
    }

    const score = this.calculateFinal(breakdown, ctx);
    return { score, breakdown };
  }

  private buildContext(options?: CompositeScoreOptions): ScoringContext {
    return {
      halfLifeDays: options?.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS,
      enablePredictive: options?.enablePredictive ?? false,
      includeSuperseded: options?.includeSuperseded ?? false,
    };
  }

  private calculateFinal(
    breakdown: ScoreBreakdown,
    ctx: ScoringContext,
  ): number {
    const supersedeFactor = this.getSupersedeFactor(breakdown, ctx);
    const predictiveBoost = ctx.enablePredictive
      ? (1 + breakdown.predictive_score)
      : 1.0;

    return (
      breakdown.fts_rank *
      breakdown.temporal_weight *
      breakdown.confidence *
      breakdown.outcome_factor *
      predictiveBoost *
      supersedeFactor
    );
  }

  private getSupersedeFactor(
    breakdown: ScoreBreakdown,
    ctx: ScoringContext,
  ): number {
    if (!breakdown.is_superseded) return 1.0;
    return ctx.includeSuperseded ? SUPERSEDED_PENALTY : 0;
  }
}
