/**
 * OutcomeStrategy — applies Bayesian outcome factor to scoring breakdown.
 * Queries OutcomeService.getFactorForEntry() for each entry.
 */

import type { DatabaseAdapter } from '../../../../database/adapters/DatabaseAdapter.js';
import type { KnowledgeEntry } from '../../models.js';
import type { ScoringStrategy, ScoreBreakdown, ScoringContext } from '../models.js';
import { OutcomeService } from '../OutcomeService.js';

export class OutcomeStrategy implements ScoringStrategy {
  readonly name = 'outcome';
  private readonly outcomeService: OutcomeService;

  constructor(adapter: DatabaseAdapter) {
    this.outcomeService = new OutcomeService(adapter);
  }

  apply(
    entry: KnowledgeEntry,
    breakdown: ScoreBreakdown,
    _ctx: ScoringContext,
  ): void {
    breakdown.outcome_factor = this.outcomeService.getFactorForEntry(entry.id);
  }
}
