/**
 * KSA-163: Dead Import Detector — Finds unused imports.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { DeadImport } from './types.js';
import { buildCodeScopeFilter } from '../../query/code-intel-isolation.js';

export class DeadImportDetector {
  private adapter: DatabaseAdapter;
  private projectId: string | undefined;

  /**
   * @param projectId  SA4E-41 tenant scope. Undefined ⇒ fail-closed (no rows).
   */
  constructor(adapter: DatabaseAdapter, projectId?: string) {
    this.adapter = adapter;
    this.projectId = projectId;
  }

  /** Find dead (unused) imports in a file or across the project. */
  detect(options: { filePath?: string; module?: string; limit?: number } = {}): DeadImport[] {
    const limit = options.limit ?? 50;
    const scope = buildCodeScopeFilter(this.projectId, 'r'); // fail-closed

    // Find imports where the target symbol is never referenced elsewhere in the same file
    let sql = `
      SELECT r.file_path as filePath, r.line, r.target_symbol as importedSymbol,
             r.metadata
      FROM relationships r
      WHERE r.kind = 'imports'
        AND ${scope.clause}
        AND NOT EXISTS (
          SELECT 1 FROM relationships r2
          WHERE r2.file_path = r.file_path
            AND r2.kind IN ('calls', 'uses')
            AND r2.target_symbol = r.target_symbol
            AND r2.id != r.id
            AND r2.project_id = r.project_id
        )
    `;
    const params: unknown[] = [...scope.params];

    if (options.filePath) {
      sql += ' AND r.file_path LIKE ?';
      params.push(`%${options.filePath}%`);
    }
    if (options.module) {
      sql += ' AND r.file_path LIKE ?';
      params.push(`%${options.module}%`);
    }

    sql += ' ORDER BY r.file_path, r.line LIMIT ?';
    params.push(limit);

    const rows = this.adapter.prepare(sql).all(...params) as Array<{
      filePath: string;
      line: number;
      importedSymbol: string;
      metadata: string | null;
    }>;

    return rows.map(row => {
      let fromModule = '';
      if (row.metadata) {
        try {
          const meta = JSON.parse(row.metadata);
          fromModule = meta.source ?? meta.from ?? '';
        } catch { /* ignore */ }
      }
      return {
        filePath: row.filePath,
        line: row.line,
        importedSymbol: row.importedSymbol,
        fromModule,
      };
    });
  }
}
