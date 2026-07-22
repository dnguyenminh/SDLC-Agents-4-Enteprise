/**
 * KSA-163: Module Summarizer — Aggregates quality metrics per module.
 * SA4E-41: tenant-scoped and fail-closed via CodeIntelIsolation.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { ModuleSummary } from './types.js';
import { GraphLoader } from './utils/GraphLoader.js';
import { CircularDepDetector } from './CircularDepDetector.js';
import { HotPathAnalyzer } from './HotPathAnalyzer.js';
import { DeadImportDetector } from './DeadImportDetector.js';
import { buildCodeScopeFilter } from '../../query/code-intel-isolation.js';

export class ModuleSummarizer {
  private adapter: DatabaseAdapter;
  private graphLoader: GraphLoader;
  private projectId: string | undefined;

  /**
   * @param projectId  SA4E-41 tenant scope. Undefined ⇒ fail-closed (no rows).
   */
  constructor(adapter: DatabaseAdapter, projectId?: string) {
    this.adapter = adapter;
    this.projectId = projectId;
    this.graphLoader = new GraphLoader(adapter, projectId);
  }

  /** Generate summary for a specific module or all modules. */
  async summarize(moduleName?: string): Promise<ModuleSummary[]> {
    const modules = await this.getModules(moduleName);
    const results: ModuleSummary[] = [];

    for (const mod of modules) {
      const circularDetector = new CircularDepDetector(this.graphLoader);
      const hotPathAnalyzer = new HotPathAnalyzer(this.graphLoader);
      const deadImportDetector = new DeadImportDetector(this.adapter, this.projectId);

      const circularDeps = circularDetector.detect({ module: mod.name });
      const hotPaths = hotPathAnalyzer.analyze({ module: mod.name, limit: 5 });
      const deadImports = await deadImportDetector.detect({ module: mod.name });
      const avgComplexity = await this.getAvgComplexity(mod.name);

      results.push({
        module: mod.name,
        fileCount: mod.fileCount,
        symbolCount: mod.symbolCount,
        circularDeps: circularDeps.length,
        hotPaths,
        deadImports: deadImports.length,
        avgComplexity,
      });
    }

    return results;
  }

  private async getModules(name?: string): Promise<Array<{ name: string; fileCount: number; symbolCount: number }>> {
    const scope = buildCodeScopeFilter(this.projectId, 'modules'); // fail-closed
    let sql = `SELECT name, file_count as fileCount, symbol_count as symbolCount FROM modules WHERE ${scope.clause}`;
    const params: unknown[] = [...scope.params];
    if (name) {
      sql += ' AND name = ?';
      params.push(name);
    }
    return this.adapter.allAsync<{ name: string; fileCount: number; symbolCount: number }>(sql, params);
  }

  private async getAvgComplexity(module: string): Promise<number | null> {
    // complexity has no project_id column — scope via the joined symbols table.
    const scope = buildCodeScopeFilter(this.projectId, 's');
    const row = await this.adapter.getAsync<{ avg: number | null }>(`
      SELECT AVG(c.cyclomatic_complexity) as avg
      FROM complexity c
      JOIN symbols s ON s.id = c.symbol_id
      JOIN files f ON f.id = s.file_id
      WHERE f.module = ? AND ${scope.clause}
    `, [module, ...scope.params]);
    return row?.avg ?? null;
  }
}
