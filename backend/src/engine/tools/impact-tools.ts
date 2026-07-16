/**
 * KSA-156: MCP Tool Registration for code_impact.
 */

import Database from 'better-sqlite3';
import { GraphRepository } from '../database/graph-repository.js';
import { SymbolResolver } from '../graph/symbol-resolver.js';
import { CallGraphService } from '../graph/call-graph-service.js';
import { FileResolver } from '../graph/file-resolver.js';
import { DependencyGraphService } from '../graph/dependency-graph-service.js';
import { TestDetector } from '../graph/test-detector.js';
import { ImpactAnalysisService, ImpactResult, ImpactAction, Severity } from '../graph/impact-analysis-service.js';

export const IMPACT_TOOL_DEFINITIONS = [
  {
    name: 'code_impact',
    description: 'Predict blast radius of modifying, deleting, or renaming a symbol. Shows affected callers, dependents, tests, and provides recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to analyze impact for' },
        action: { type: 'string', enum: ['modify', 'delete', 'rename'], description: 'Type of change (default: modify)' },
        depth: { type: 'number', description: 'Analysis depth 1-5 (default: 3)' },
        include_tests: { type: 'boolean', description: 'Include affected test files (default: true)' },
        severity_threshold: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Minimum severity to include (default: low)' },
      },
      required: ['symbol'],
    },
  },
];

export function handleCodeImpact(args: Record<string, unknown>, db: Database.Database, workspace: string, projectId?: string): string {
  const symbol = args.symbol as string;
  if (!symbol) return JSON.stringify({ error: 'Parameter "symbol" is required' });

  const action = (args.action as ImpactAction) ?? 'modify';
  const depth = (args.depth as number) ?? 3;
  const includeTests = (args.include_tests as boolean) ?? true;
  const severityThreshold = (args.severity_threshold as Severity) ?? 'low';

  const graphRepo = new GraphRepository(db, projectId);
  const resolver = new SymbolResolver(db, projectId);
  const callGraph = new CallGraphService(graphRepo, resolver);
  const fileResolver = new FileResolver(db, workspace, projectId);
  const depGraph = new DependencyGraphService(db, fileResolver, projectId);
  const testDetector = new TestDetector(db, projectId);

  const service = new ImpactAnalysisService(db, callGraph, depGraph, resolver, testDetector);
  const result = service.analyzeImpact(symbol, action, depth, includeTests, severityThreshold);

  return formatImpactResult(result);
}

function formatImpactResult(result: ImpactResult): string {
  const lines: string[] = [];

  lines.push(`Impact Analysis: "${result.symbol}" (${result.action})\n`);
  lines.push(`Blast Radius:`);
  lines.push(`  Critical: ${result.blastRadius.summary.critical}`);
  lines.push(`  High: ${result.blastRadius.summary.high}`);
  lines.push(`  Medium: ${result.blastRadius.summary.medium}`);
  lines.push(`  Low: ${result.blastRadius.summary.low}`);
  lines.push(`  Total affected: ${result.blastRadius.totalAffected} (${result.blastRadius.affectedFiles} files)`);
  lines.push(`  Affected tests: ${result.blastRadius.affectedTests}\n`);

  if (result.impacts.length > 0) {
    lines.push(`Impacts:`);
    for (const impact of result.impacts.slice(0, 30)) {
      const icon = impact.severity === 'critical' ? '!!' : impact.severity === 'high' ? '!' : '-';
      lines.push(`  ${icon} [${impact.severity}] ${impact.symbol}`);
      lines.push(`    ${impact.file}:${impact.line} - ${impact.reason}`);
    }
    if (result.impacts.length > 30) {
      lines.push(`  ... and ${result.impacts.length - 30} more`);
    }
    lines.push('');
  }

  if (result.affectedTests.length > 0) {
    lines.push(`Affected Tests:`);
    for (const test of result.affectedTests.slice(0, 10)) {
      lines.push(`  - ${test.file} (${test.reason})`);
    }
    lines.push('');
  }

  if (result.recommendations.length > 0) {
    lines.push(`Recommendations:`);
    for (const rec of result.recommendations) {
      lines.push(`  * ${rec}`);
    }
    lines.push('');
  }

  lines.push(`--- ${result.metadata.queryTimeMs}ms | depth ${result.metadata.depthSearched}${result.metadata.truncated ? ' | TRUNCATED' : ''}`);
  return lines.join('\n');
}
