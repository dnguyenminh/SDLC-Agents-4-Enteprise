/**
 * KSA-156: Impact Analysis helpers - extracted from ImpactAnalysisService.
 * Pure functions for severity classification, recommendation generation, etc.
 * SA4E-45: Refactored to use DatabaseAdapter abstraction.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { ResolvedSymbol } from './symbol-resolver.js';
import { TestDetector, RelatedTest } from './test-detector.js';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type ImpactAction = 'modify' | 'delete' | 'rename';

export interface ImpactItem {
  symbol: string;
  qualifiedName?: string;
  file: string;
  line: number;
  severity: Severity;
  reason: string;
  chain?: string[];
}

export interface ImpactResult {
  symbol: string;
  action: ImpactAction;
  blastRadius: {
    summary: Record<Severity, number>;
    totalAffected: number;
    affectedFiles: number;
    affectedTests: number;
  };
  impacts: ImpactItem[];
  affectedTests: RelatedTest[];
  recommendations: string[];
  metadata: {
    queryTimeMs: number;
    depthSearched: number;
    truncated: boolean;
  };
}

export function classifySeverity(depth: number, action: ImpactAction, type: string): Severity {
  if (action === 'delete') {
    if (depth <= 1) return 'critical';
    if (depth <= 2) return 'high';
    return 'medium';
  }
  if (action === 'rename' && depth <= 1) return 'high';
  if (depth === 1) return 'critical';
  if (depth === 2) return 'high';
  if (depth === 3) return 'medium';
  return 'low';
}

/** Find implementors of an interface method that would be impacted. */
export function findImplementorImpacts(resolved: ResolvedSymbol[], symbolName: string, adapter: DatabaseAdapter): ImpactItem[] {
  const impacts: ImpactItem[] = [];
  for (const sym of resolved) {
    if (sym.kind !== 'method') continue;
    if (!sym.parentSymbolId) continue;
    const parent = adapter.get<{ kind: string; name: string }>(
      'SELECT kind, name FROM symbols WHERE id = ?', [sym.parentSymbolId]);
    if (!parent || parent.kind !== 'interface') continue;
    const implementors = adapter.all<{ name: string; file_path: string; line: number }>(`
      SELECT DISTINCT s.name, f.relative_path as file_path, s.start_line as line
      FROM relationships r
      JOIN symbols s ON s.id = r.source_symbol_id
      JOIN files f ON s.file_id = f.id
      WHERE r.target_symbol = ? AND r.kind = 'implements'
    `, [parent.name]);
    for (const impl of implementors) {
      impacts.push({
        symbol: `${impl.name}.${sym.name}`,
        file: impl.file_path,
        line: impl.line,
        severity: 'critical',
        reason: `Implements ${parent.name}.${sym.name}`,
      });
    }
  }
  return impacts;
}

export function generateRecommendations(impacts: ImpactItem[], action: ImpactAction, symbol: string, testDetector: TestDetector): string[] {
  const recs: string[] = [];
  const critical = impacts.filter(i => i.severity === 'critical');
  const testImpacts = impacts.filter(i => testDetector.isTestFile(i.file));
  if (action === 'delete' && impacts.length === 0) {
    recs.push(`Safe to delete "${symbol}" - no references found`);
  } else if (action === 'delete' && impacts.length > 0) {
    recs.push(`Remove all ${impacts.length} references before deleting "${symbol}"`);
  }
  if (action === 'modify' && critical.length > 0) {
    recs.push(`Update ${critical.length} direct callers if signature changes`);
  }
  if (action === 'rename') {
    const files = new Set(impacts.map(i => i.file)).size;
    recs.push(`Update references in ${files} files with new name`);
  }
  if (testImpacts.length > 0) {
    const testFiles = testImpacts.map(t => t.file).slice(0, 5);
    recs.push(`Run affected tests: ${testFiles.join(', ')}`);
  }
  if (impacts.length > 20) {
    recs.push('Consider incremental refactoring to reduce blast radius');
  }
  return recs;
}

export function filterBySeverity(impacts: ImpactItem[], threshold: Severity): ImpactItem[] {
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const thresholdOrder = order[threshold];
  return impacts.filter(i => order[i.severity] <= thresholdOrder);
}

export function deduplicate(impacts: ImpactItem[]): ImpactItem[] {
  const seen = new Set<string>();
  return impacts.filter(i => {
    const key = `${i.file}:${i.symbol}:${i.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function severityOrder(severity: Severity): number {
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return order[severity];
}

export function buildSummary(impacts: ImpactItem[]): Record<Severity, number> {
  const summary: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of impacts) { summary[i.severity]++; }
  return summary;
}

export function emptyResult(symbolName: string, action: ImpactAction): ImpactResult {
  return {
    symbol: symbolName,
    action,
    blastRadius: { summary: { critical: 0, high: 0, medium: 0, low: 0 }, totalAffected: 0, affectedFiles: 0, affectedTests: 0 },
    impacts: [],
    affectedTests: [],
    recommendations: [`Symbol "${symbolName}" not found in index`],
    metadata: { queryTimeMs: 0, depthSearched: 0, truncated: false },
  };
}
