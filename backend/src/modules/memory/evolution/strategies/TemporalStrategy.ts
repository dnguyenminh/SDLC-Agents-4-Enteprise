/**
 * TemporalStrategy — applies exponential decay based on entry age.
 * Formula: weight = pinned ? 1.0 : 0.5^(ageDays / halfLifeDays)
 */

import type { KnowledgeEntry } from '../../models.js';
import type { ScoringStrategy, ScoreBreakdown, ScoringContext } from '../models.js';

const MS_PER_DAY = 86_400_000;

export class TemporalStrategy implements ScoringStrategy {
  readonly name = 'temporal';

  apply(
    entry: KnowledgeEntry,
    breakdown: ScoreBreakdown,
    ctx: ScoringContext,
  ): void {
    if (entry.pinned) {
      breakdown.temporal_weight = 1.0;
      return;
    }

    const ageDays = this.computeAgeDays(entry.updated_at);
    if (ageDays <= 0) {
      breakdown.temporal_weight = 1.0;
      return;
    }

    const halfLife = ctx.halfLifeDays > 0 ? ctx.halfLifeDays : 30;
    breakdown.temporal_weight = Math.pow(0.5, ageDays / halfLife);
  }

  private computeAgeDays(updatedAt: string): number {
    const ts = Date.parse(updatedAt);
    if (Number.isNaN(ts)) return 0;
    return (Date.now() - ts) / MS_PER_DAY;
  }
}
