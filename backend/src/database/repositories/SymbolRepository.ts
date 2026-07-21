/**
 * SA4E-50 — SymbolRepository: queries index.db for code symbol counts.
 * Eliminates raw SQL from analytics.ts.
 * Implements: UC-02, BR-02
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import type { ISymbolRepository } from './interfaces.js';
import { SYMBOL_KINDS_SQL } from '../constants.js';
import { translateError } from '../errors/index.js';

/**
 * Repository for code symbol queries against the symbols table.
 * Uses pre-computed SYMBOL_KINDS_SQL constant for the IN clause.
 */
export class SymbolRepository implements ISymbolRepository {
  constructor(private readonly adapter: DatabaseAdapter) {}

  /**
   * Count code symbols matching canonical SYMBOL_KINDS.
   * @returns Number of matching symbols in the index
   * @throws RepositoryError on database failure
   */
  getSymbolCount(): number {
    try {
      const row = this.adapter.get<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM symbols WHERE kind IN (${SYMBOL_KINDS_SQL})`,
      );
      return row?.cnt ?? 0;
    } catch (err) {
      throw translateError(err);
    }
  }
}
