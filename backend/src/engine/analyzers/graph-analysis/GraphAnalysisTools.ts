/**
 * KSA-163: MCP Tool registrations for graph analysis tools.
 * SA4E-45: Refactored to accept DatabaseAdapter.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { GraphLoader } from './utils/GraphLoader.js';
import { CircularDepDetector } from './CircularDepDetector.js';
import { RelatedTestFinder } from './RelatedTestFinder.js';
import { HotPathAnalyzer } from './HotPathAnalyzer.js';
import { DeadImportDetector } from './DeadImportDetector.js';
import { ModuleSummarizer } from './ModuleSummarizer.js';

export const GRAPH_ANALYSIS_TOOL_DEFINITIONS = [
  {
    name: 'find_circular_deps',
    description: 'Find circular dependencies in the codebase using Tarjan\'s SCC algorithm.',
    inputSchema: { type: 'object', properties: { module: { type: 'string', description: 'Filter by module name' }, max_length: { type: 'number', description: 'Max cycle length to report (default: unlimited)' } } },
  },
  {
    name: 'find_related_tests',
    description: 'Find test files/functions that test a given symbol (reverse BFS on call graph).',
    inputSchema: { type: 'object', properties: { symbol_name: { type: 'string', description: 'Symbol name to find tests for' }, file_path: { type: 'string', description: 'File path to disambiguate symbol' }, max_depth: { type: 'number', description: 'Max call chain depth (default: 3)' } }, required: ['symbol_name'] },
  },
  {
    name: 'find_hot_paths',
    description: 'Find most-called functions (hot paths) by transitive caller count.',
    inputSchema: { type: 'object', properties: { module: { type: 'string', description: 'Filter by module name' }, limit: { type: 'number', description: 'Max results (default: 20)' }, min_callers: { type: 'number', description: 'Minimum direct callers threshold (default: 2)' } } },
  },
  {
    name: 'find_dead_imports',
    description: 'Find unused/dead imports in the codebase.',
    inputSchema: { type: 'object', properties: { file_path: { type: 'string', description: 'Filter by file path' }, module: { type: 'string', description: 'Filter by module name' }, limit: { type: 'number', description: 'Max results (default: 50)' } } },
  },
  {
    name: 'module_summary',
    description: 'Get quality summary for a module: circular deps, hot paths, dead imports, avg complexity.',
    inputSchema: { type: 'object', properties: { module: { type: 'string', description: 'Module name (omit for all modules)' } } },
  },
];

/** Dispatch a graph analysis tool call (SA4E-41: tenant-scoped, fail-closed). */
export async function handleGraphAnalysisTool(name: string, args: Record<string, unknown>, adapter: DatabaseAdapter, projectId?: string): Promise<string | null> {
  const graphLoader = new GraphLoader(adapter, projectId);
  switch (name) {
    case 'find_circular_deps': return handleCircularDeps(args, graphLoader);
    case 'find_related_tests': return handleRelatedTests(args, graphLoader);
    case 'find_hot_paths': return handleHotPaths(args, graphLoader);
    case 'find_dead_imports': return await handleDeadImports(args, adapter, projectId);
    case 'module_summary': return await handleModuleSummary(args, adapter, projectId);
    default: return null;
  }
}

function handleCircularDeps(args: Record<string, unknown>, graphLoader: GraphLoader): string {
  const detector = new CircularDepDetector(graphLoader);
  const results = detector.detect({ module: args.module as string | undefined, maxLength: args.max_length as number | undefined });
  if (results.length === 0) return 'No circular dependencies found.';
  const lines = [`Found ${results.length} circular dependencies:\n`];
  for (const dep of results) {
    lines.push(`[${dep.severity.toUpperCase()}] Cycle (length ${dep.length}):`);
    lines.push(`  ${dep.cycle.edges.join(' → ')}`);
    for (const node of dep.cycle.nodes) { lines.push(`    - ${node.name} (${node.kind}) — ${node.filePath}`); }
    lines.push('');
  }
  return lines.join('\n');
}

function handleRelatedTests(args: Record<string, unknown>, graphLoader: GraphLoader): string {
  const symbolName = args.symbol_name as string;
  if (!symbolName) return 'Parameter "symbol_name" is required.';
  const finder = new RelatedTestFinder(graphLoader);
  const result = finder.find(symbolName, { maxDepth: args.max_depth as number | undefined, filePath: args.file_path as string | undefined });
  if (!result) return `Symbol "${symbolName}" not found in index.`;
  if (result.totalTests === 0) return `No tests found for "${symbolName}".`;
  const lines = [`Tests for ${result.symbol.name} (${result.symbol.filePath}):\n`, `Direct tests (${result.directTests.length}):`];
  for (const t of result.directTests) { lines.push(`  ✓ ${t.testName} — ${t.filePath}`); }
  if (result.indirectTests.length > 0) {
    lines.push(`\nIndirect tests (${result.indirectTests.length}):`);
    for (const t of result.indirectTests) { lines.push(`  ○ ${t.testName} — ${t.filePath} (depth: ${t.depth})`); lines.push(`    Chain: ${t.path.join(' → ')}`); }
  }
  return lines.join('\n');
}

function handleHotPaths(args: Record<string, unknown>, graphLoader: GraphLoader): string {
  const analyzer = new HotPathAnalyzer(graphLoader);
  const results = analyzer.analyze({ module: args.module as string | undefined, limit: args.limit as number | undefined, minCallers: args.min_callers as number | undefined });
  if (results.length === 0) return 'No hot paths found (no functions with multiple callers).';
  const lines = [`Hot Paths — Top ${results.length} most-called functions:\n`];
  for (let i = 0; i < results.length; i++) {
    const hp = results[i];
    lines.push(`${i + 1}. ${hp.symbolName} (${hp.kind}) — ${hp.directCallers} direct, ${hp.transitiveCallers} transitive callers`);
    lines.push(`   ${hp.filePath}`);
  }
  return lines.join('\n');
}

async function handleDeadImports(args: Record<string, unknown>, adapter: DatabaseAdapter, projectId?: string): Promise<string> {
  const detector = new DeadImportDetector(adapter, projectId);
  const results = await detector.detect({ filePath: args.file_path as string | undefined, module: args.module as string | undefined, limit: args.limit as number | undefined });
  if (results.length === 0) return 'No dead imports found.';
  const lines = [`Found ${results.length} potentially unused imports:\n`];
  for (const imp of results) { lines.push(`  ${imp.filePath}:${imp.line} — ${imp.importedSymbol}${imp.fromModule ? ` from "${imp.fromModule}"` : ''}`); }
  return lines.join('\n');
}

async function handleModuleSummary(args: Record<string, unknown>, adapter: DatabaseAdapter, projectId?: string): Promise<string> {
  const summarizer = new ModuleSummarizer(adapter, projectId);
  const results = await summarizer.summarize(args.module as string | undefined);
  if (results.length === 0) return 'No modules found.';
  const lines = [`Module Quality Summary (${results.length} modules):\n`];
  for (const mod of results) {
    lines.push(`📦 ${mod.module}`);
    lines.push(`   Files: ${mod.fileCount} | Symbols: ${mod.symbolCount}`);
    lines.push(`   Circular Deps: ${mod.circularDeps} | Dead Imports: ${mod.deadImports}`);
    lines.push(`   Avg Complexity: ${mod.avgComplexity?.toFixed(1) ?? 'N/A'}`);
    if (mod.hotPaths.length > 0) lines.push(`   Hot Paths: ${mod.hotPaths.map(h => h.symbolName).join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}
