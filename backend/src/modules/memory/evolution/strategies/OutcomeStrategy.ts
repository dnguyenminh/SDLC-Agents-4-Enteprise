/**
 * OutcomeStrategy — applies Bayesian outcome factor to scoring breakdown.
 * Queries OutcomeService.getFactorForEntry() for each entry.
 */

import type Database from 'better-sqlite3';
import type { KnowledgeEntry } from '../../models.js';
import type { ScoringStrategy, ScoreBreakdown, ScoringContext } from '../models.js';
import { OutcomeService } from '../OutcomeService.js';

export class OutcomeStrategy implements ScoringStrategy {
  readonly name = 'outcome';
  private readonly outcomeService: OutcomeService;

  constructor(db: Database.Database) {
    this.outcomeService = new OutcomeService(db);
  }

  apply(
    entry: KnowledgeEntry,
    breakdown: ScoreBreakdown,
    _ctx: ScoringContext,
  ): void {
    breakdown.outcome_factor = this.outcomeService.getFactorForEntry(entry.id);
  }
}
