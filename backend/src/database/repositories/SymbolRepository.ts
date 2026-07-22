/**
 * SA4E-50 — SymbolRepository: queries symbols table for code symbol counts.
 * SA4E-53: refactored to async DatabaseAdapter API for PostgreSQL compatibility.
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import type { ISymbolRepository } from './interfaces.js';
import type { SymbolDetail } from './types.js';
import { SYMBOL_KINDS_SQL } from '../constants.js';
import { translateError } from '../errors/index.js';

export class SymbolRepository implements ISymbolRepository {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async getSymbolCount(): Promise<number> {
    try {
      const row = await this.adapter.getAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM symbols WHERE kind IN (${SYMBOL_KINDS_SQL})`,
      );
      return row?.cnt ?? 0;
    } catch (err) {
      throw translateError(err);
    }
  }

  async getSymbolDetail(symbolId: string): Promise<SymbolDetail | null> {
    try {
      const row = await this.adapter.getAsync<any>(
        `SELECT s.id, s.name, s.kind, s.signature, s.start_line, s.end_line,
                s.parent_symbol, s.visibility, s.doc_comment,
                f.relative_path, f.language, f.module
         FROM symbols s JOIN files f ON s.file_id = f.id
         WHERE s.id = ?`,
        [symbolId],
      );
      if (!row) return null;
      return {
        id: row.id, name: row.name, kind: row.kind,
        signature: row.signature ?? null,
        startLine: row.start_line ?? null, endLine: row.end_line ?? null,
        parentSymbol: row.parent_symbol ?? null,
        visibility: row.visibility ?? null,
        docComment: row.doc_comment ?? null,
        relativePath: row.relative_path ?? null,
        language: row.language ?? null, module: row.module ?? null,
      };
    } catch (err) {
      throw translateError(err);
    }
  }
}
