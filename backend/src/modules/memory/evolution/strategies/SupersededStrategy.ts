/**
 * SupersededStrategy — marks entry as superseded if superseded_by is set.
 */

import type { KnowledgeEntry } from '../../models.js';
import type { ScoringStrategy, ScoreBreakdown, ScoringContext } from '../models.js';

/** Extended entry type that may have superseded_by column. */
interface EntryWithSuperseded extends KnowledgeEntry {
  superseded_by?: number | null;
}

export class SupersededStrategy implements ScoringStrategy {
  readonly name = 'superseded';

  apply(
    entry: KnowledgeEntry,
    breakdown: ScoreBreakdown,
    _ctx: ScoringContext,
  ): void {
    const ext = entry as EntryWithSuperseded;
    if (ext.superseded_by != null && ext.superseded_by > 0) {
      breakdown.is_superseded = true;
    }
  }
}
