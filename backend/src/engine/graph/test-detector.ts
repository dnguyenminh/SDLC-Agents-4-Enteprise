/**
 * KSA-156: Test Detector - identifies test files and finds related tests for symbols.
 */

import * as path from 'path';
import Database from 'better-sqlite3';
import { ResolvedSymbol } from './symbol-resolver.js';
import { buildCodeScopeFilter } from '../query/code-intel-isolation.js';

export interface RelatedTest {
  file: string;
  reason: string;
}

export class TestDetector {
  private db: Database.Database;
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
   * @param projectId  SA4E-41 tenant scope. Undefined ⇒ fail-closed (no rows).
   */
  constructor(db: Database.Database, projectId?: string) {
    this.db = db;
    this.projectId = projectId;
  }

  /** Check if a file path is a test file. */
  isTestFile(filePath: string): boolean {
    const basename = path.basename(filePath);
    return TestDetector.TEST_PATH_PATTERNS.some(p => p.test(filePath)) ||
           TestDetector.TEST_FILE_PATTERNS.some(p => p.test(basename));
  }

  /** Find test files related to the given symbols and impacts. */
  findRelatedTests(
    symbols: ResolvedSymbol[],
    impactFiles: string[]
  ): RelatedTest[] {
    const results: RelatedTest[] = [];
    const seen = new Set<string>();

    for (const sym of symbols) {
      const sourceBasename = path.basename(sym.filePath, path.extname(sym.filePath));

      // Find test files that import the source file (tenant-scoped, fail-closed)
      const scope = buildCodeScopeFilter(this.projectId, 'relationships');
      const testFiles = this.db.prepare(`
        SELECT DISTINCT file_path FROM relationships
        WHERE kind = 'imports' AND target_symbol LIKE ? AND ${scope.clause}
      `).all(`%${sourceBasename}%`, ...scope.params) as { file_path: string }[];

      for (const tf of testFiles) {
        if (this.isTestFile(tf.file_path) && !seen.has(tf.file_path)) {
          seen.add(tf.file_path);
          results.push({ file: tf.file_path, reason: `Tests ${sym.name}` });
        }
      }
    }

    // Check if any impact targets are in test files
    for (const file of impactFiles) {
      if (this.isTestFile(file) && !seen.has(file)) {
        seen.add(file);
        results.push({ file, reason: 'Calls modified symbol' });
      }
    }

    return results;
  }
}
