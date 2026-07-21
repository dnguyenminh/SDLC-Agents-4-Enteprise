/**
 * KSA-161: Complexity Analyzer — Main orchestrator.
 * Coordinates calculation, grading, and storage.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { SyntaxNode } from '../../parsers/types.js';
import type { ComplexityResult, ComplexityFilters, ComplexityQueryResult, FileComplexityResult } from './types.js';
import { ComplexityCalculator } from './ComplexityCalculator.js';
import { GradeAssigner } from './GradeAssigner.js';
import { ComplexityStore } from './ComplexityStore.js';
import { buildCodeScopeFilter } from '../../query/code-intel-isolation.js';

export class ComplexityAnalyzer {
  private calculator: ComplexityCalculator;
  private grader: GradeAssigner;
  private store: ComplexityStore;
  private adapter: DatabaseAdapter;
  private projectId: string | undefined;

  /**
   * @param projectId  SA4E-41 read scope. Undefined ⇒ query()/getBySymbolName fail-closed.
   */
  constructor(adapter: DatabaseAdapter, projectId?: string) {
    this.adapter = adapter;
    this.projectId = projectId;
    this.calculator = new ComplexityCalculator();
    this.grader = new GradeAssigner();
    this.store = new ComplexityStore(adapter, projectId);
  }

  /** Analyze a single function given its body AST node. */
  analyzeFunction(
    symbolId: number,
    symbolName: string,
    filePath: string,
    startLine: number,
    endLine: number,
    bodyNode: SyntaxNode,
    language: string
  ): ComplexityResult | null {
    const breakdown = this.calculator.calculate(bodyNode, language);
    if (!breakdown) return null;

    const grade = this.grader.assignGrade(breakdown.cyclomatic_complexity);
    const result: ComplexityResult = {
      symbol_id: symbolId,
      symbol_name: symbolName,
      file_path: filePath,
      start_line: startLine,
      end_line: endLine,
      grade,
      ...breakdown,
    };

    this.store.upsert(result);
    return result;
  }

  /** Analyze all functions in a file (from DB symbols). Returns file-level summary. */
  analyzeFileFromDB(filePath: string, parseAndGetBody: (symbolId: number, startLine: number, endLine: number) => SyntaxNode | null): FileComplexityResult {
    const symbols = this.adapter.prepare(`
      SELECT s.id, s.name, s.start_line, s.end_line, f.language, f.relative_path
      FROM symbols s
      JOIN files f ON f.id = s.file_id
      WHERE f.relative_path LIKE ? AND s.kind IN ('function', 'method')
    `).all(`%${filePath}%`) as Array<{
      id: number; name: string; start_line: number; end_line: number;
      language: string; relative_path: string;
    }>;

    const results: ComplexityResult[] = [];
    for (const sym of symbols) {
      const bodyNode = parseAndGetBody(sym.id, sym.start_line, sym.end_line);
      if (!bodyNode) continue;
      const result = this.analyzeFunction(
        sym.id, sym.name, sym.relative_path,
        sym.start_line, sym.end_line, bodyNode, sym.language
      );
      if (result) results.push(result);
    }

    const totalCC = results.reduce((sum, r) => sum + r.cyclomatic_complexity, 0);
    return {
      file_path: filePath,
      functions: results,
      average_complexity: results.length > 0 ? totalCC / results.length : 0,
      max_complexity: results.length > 0 ? Math.max(...results.map(r => r.cyclomatic_complexity)) : 0,
      total_functions: results.length,
    };
  }

  /** Query stored complexity results with filters. */
  query(filters: ComplexityFilters): ComplexityQueryResult {
    return this.store.query(filters);
  }

  /** Get complexity for a specific symbol by name. */
  getBySymbolName(symbolName: string, filePath?: string): ComplexityResult | null {
    const scope = buildCodeScopeFilter(this.projectId, 's'); // fail-closed
    let sql = `
      SELECT s.id FROM symbols s
      JOIN files f ON f.id = s.file_id
      WHERE s.name = ? AND ${scope.clause}
    `;
    const params: unknown[] = [symbolName, ...scope.params];
    if (filePath) {
      sql += ' AND f.relative_path LIKE ?';
      params.push(`%${filePath}%`);
    }
    sql += ' LIMIT 1';

    const row = this.adapter.prepare(sql).get(...params) as { id: number } | undefined;
    if (!row) return null;
    return this.store.getBySymbol(row.id);
  }

  /** Check if calculator supports a language. */
  supportsLanguage(language: string): boolean {
    return this.calculator.supportsLanguage(language);
  }
}
