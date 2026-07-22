/**
 * KSA-154: MCP Tool Registration for code_callers and code_callees.
 * SA4E-45: Refactored to use DatabaseAdapter abstraction.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { GraphRepository } from '../database/graph-repository.js';
import { SymbolResolver } from '../graph/symbol-resolver.js';
import { CallGraphService, CallGraphResponse } from '../graph/call-graph-service.js';

export const CALL_GRAPH_TOOL_DEFINITIONS = [
  {
    name: 'code_callers',
    description: 'Find all callers of a function/method with transitive depth control. Supports qualified names (Class.method) and file:symbol format.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to find callers for (e.g. "processData", "MyClass.method", "src/utils:helper")' },
        depth: { type: 'number', description: 'Transitive depth (1-5, default 1)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        file_filter: { type: 'string', description: 'Filter results by file path pattern (glob)' },
        kind_filter: { type: 'string', description: 'Relationship kind filter (default: calls)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'code_callees',
    description: 'Find all functions/methods called by a given symbol with transitive depth.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to find callees for' },
        depth: { type: 'number', description: 'Transitive depth (1-5, default 1)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        file_filter: { type: 'string', description: 'Filter results by file path pattern (glob)' },
        include_external: { type: 'boolean', description: 'Include external/unresolved callees (default true)' },
      },
      required: ['symbol'],
    },
  },
];

export async function handleCodeCallers(args: Record<string, unknown>, adapter: DatabaseAdapter, projectId?: string): Promise<string> {
  const symbol = args.symbol as string;
  if (!symbol) return JSON.stringify({ error: 'Parameter "symbol" is required' });
  const depth = (args.depth as number) ?? 1;
  const limit = (args.limit as number) ?? 20;
  const fileFilter = args.file_filter as string | undefined;
  const kindFilter = (args.kind_filter as string) ?? 'calls';
  const graphRepo = new GraphRepository(adapter, projectId);
  const resolver = new SymbolResolver(adapter, projectId);
  const service = new CallGraphService(graphRepo, resolver);
  const result = await service.findCallers(symbol, depth, limit, fileFilter, kindFilter);
  return formatCallGraphResult(result, 'callers');
}

export async function handleCodeCallees(args: Record<string, unknown>, adapter: DatabaseAdapter, projectId?: string): Promise<string> {
  const symbol = args.symbol as string;
  if (!symbol) return JSON.stringify({ error: 'Parameter "symbol" is required' });
  const depth = (args.depth as number) ?? 1;
  const limit = (args.limit as number) ?? 20;
  const fileFilter = args.file_filter as string | undefined;
  const includeExternal = (args.include_external as boolean) ?? true;
  const graphRepo = new GraphRepository(adapter, projectId);
  const resolver = new SymbolResolver(adapter, projectId);
  const service = new CallGraphService(graphRepo, resolver);
  const result = await service.findCallees(symbol, depth, limit, fileFilter, includeExternal);
  return formatCallGraphResult(result, 'callees');
}

function formatCallGraphResult(result: CallGraphResponse, direction: string): string {
  if (result.results.length === 0 && result.resolvedTo.length === 0) {
    const suggestions = (result as any).suggestions;
    if (suggestions && suggestions.length > 0) {
      return `Symbol "${result.symbol}" not found. Did you mean: ${suggestions.join(', ')}?`;
    }
    return `Symbol "${result.symbol}" not found in index.`;
  }
  if (result.results.length === 0) {
    return `No ${direction} found for "${result.symbol}" (resolved to ${result.resolvedTo.length} definition(s))`;
  }
  const lines: string[] = [];
  lines.push(`${direction === 'callers' ? 'Callers' : 'Callees'} of "${result.symbol}" (depth ${result.metadata.depthSearched}):\n`);
  if (result.resolvedTo.length > 0) {
    lines.push(`Resolved to:`);
    for (const r of result.resolvedTo) { lines.push(`  [${r.kind}] ${r.file}:${r.line}`); }
    lines.push('');
  }
  for (const item of result.results) {
    const prefix = '  '.repeat(item.depthLevel);
    lines.push(`${prefix}[${item.kind}] ${item.qualifiedName}`);
    lines.push(`${prefix}  ${item.filePath}:${item.callSiteLine} (def: L${item.definitionLine})`);
  }
  lines.push(`\n--- ${result.metadata.totalCount} results | ${result.metadata.queryTimeMs}ms${result.metadata.truncated ? ' | TRUNCATED' : ''}`);
  return lines.join('\n');
}




