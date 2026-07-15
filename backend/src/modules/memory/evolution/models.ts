/**
 * Evolution scoring models — interfaces for temporal decay,
 * confidence, outcome, and superseded strategies.
 */

import type { KnowledgeEntry } from '../models.js';

/** Context passed to scoring strategies for configuration. */
export interface ScoringContext {
  halfLifeDays: number;
  enablePredictive: boolean;
  includeSuperseded: boolean;
}

/** Breakdown of individual scoring components. */
export interface ScoreBreakdown {
  fts_rank: number;
  temporal_weight: number;
  confidence: number;
  outcome_factor: number;
  predictive_score: number;
  is_superseded: boolean;
}

/** Strategy interface — each strategy mutates the breakdown. */
export interface ScoringStrategy {
  name: string;
  apply(
    entry: KnowledgeEntry,
    breakdown: ScoreBreakdown,
    ctx: ScoringContext,
  ): void;
}

/** Result returned by CompositeScorer.computeCompositeScore(). */
export interface CompositeResult {
  score: number;
  breakdown: ScoreBreakdown;
}

/** Options for computeCompositeScore(). */
export interface CompositeScoreOptions {
  halfLifeDays?: number;
  enablePredictive?: boolean;
  includeSuperseded?: boolean;
}

/** Factory for a default empty breakdown. */
export function createEmptyBreakdown(ftsRank: number): ScoreBreakdown {
  return {
    fts_rank: ftsRank,
    temporal_weight: 1.0,
    confidence: 1.0,
    outcome_factor: 1.0,
    predictive_score: 0,
    is_superseded: false,
  };
}
