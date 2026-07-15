/**
 * ConfidenceStrategy — reads entry.confidence into the breakdown.
 */

import type { KnowledgeEntry } from '../../models.js';
import type { ScoringStrategy, ScoreBreakdown, ScoringContext } from '../models.js';

export class ConfidenceStrategy implements ScoringStrategy {
  readonly name = 'confidence';

  apply(
    entry: KnowledgeEntry,
    breakdown: ScoreBreakdown,
    _ctx: ScoringContext,
  ): void {
    const val = entry.confidence;
    breakdown.confidence = (val >= 0 && val <= 1) ? val : 1.0;
  }
}
