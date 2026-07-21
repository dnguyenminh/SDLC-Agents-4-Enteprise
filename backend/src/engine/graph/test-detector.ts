/**
 * KSA-156: Test Detector - identifies test files and finds related tests for symbols.
 * SA4E-45: Refactored to use DatabaseAdapter abstraction.
 */

import * as path from 'path';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { ResolvedSymbol } from './symbol-resolver.js';
import { buildCodeScopeFilter } from '../query/code-intel-isolation.js';

export interface RelatedTest {
  file: string;
  reason: string;
}

export class TestDetector {
  private adapter: DatabaseAdapter;
  private projectId: string | undefined;

  private static readonly TEST_PATH_PATTERNS = [
    /\/tests?\//i,
    /\/__tests__\//,
    /\/spec\//i,
  ];

  private static readonly TEST_FILE_PATTERNS = [
    /\.test\.[tj]sx?$/,
    /\.spec\.[tj]sx?$/,
    /Test\.kt$/,
    /_test\.py$/,
    /^test_.*\.py$/,
  ];

  /**
   * @param projectId  SA4E-41 tenant scope. Undefined => fail-closed (no rows).
   */
  constructor(adapter: DatabaseAdapter, projectId?: string) {
    this.adapter = adapter;
    this.projectId = projectId;
  }

  /** Check if a file path is a test file. */
  isTestFile(filePath: string): boolean {
    const basename = path.basename(filePath);
    return TestDetector.TEST_PATH_PATTERNS.some(p => p.test(filePath)) ||
           TestDetector.TEST_FILE_PATTERNS.some(p => p.test(basename));
  }

  /** Find test files related to the given symbols and impacts. */
  findRelatedTests(symbols: ResolvedSymbol[], impactFiles: string[]): RelatedTest[] {
    const results: RelatedTest[] = [];
    const seen = new Set<string>();

    for (const sym of symbols) {
      const sourceBasename = path.basename(sym.filePath, path.extname(sym.filePath));
      const scope = buildCodeScopeFilter(this.projectId, 'relationships');
      const testFiles = this.adapter.all<{ file_path: string }>(`
        SELECT DISTINCT file_path FROM relationships
        WHERE kind = 'imports' AND target_symbol LIKE ? AND ${scope.clause}
      `, [`%${sourceBasename}%`, ...scope.params]);

      for (const tf of testFiles) {
        if (this.isTestFile(tf.file_path) && !seen.has(tf.file_path)) {
          seen.add(tf.file_path);
          results.push({ file: tf.file_path, reason: `Tests ${sym.name}` });
        }
      }
    }

    for (const file of impactFiles) {
      if (this.isTestFile(file) && !seen.has(file)) {
        seen.add(file);
        results.push({ file, reason: 'Calls modified symbol' });
      }
    }

    return results;
  }
}
