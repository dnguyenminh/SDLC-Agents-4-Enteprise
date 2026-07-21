/**
 * KSA-157: MCP Tool Registration for code_traverse.
 * SA4E-45: Refactored to use DatabaseAdapter abstraction.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { SymbolResolver } from '../graph/symbol-resolver.js';
import { GraphTraverser, TraverseConfig } from '../graph/traverser.js';

export const TRAVERSE_TOOL_DEFINITIONS = [
  {
    name: 'code_traverse',
    description: 'Generic graph traversal with custom edge/node type filters. Traverse the code relationship graph from any symbol with fine-grained control.',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Start symbol (e.g. "MyClass", "MyClass.method", "file.ts:func")' },
        edge_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by edge types: calls, imports, inherits, implements, uses, decorates (default: all)',
        },
        node_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by node types: function, class, interface, method, variable (default: all)',
        },
        direction: { type: 'string', enum: ['outgoing', 'incoming', 'both'], description: 'Traversal direction (default: outgoing)' },
        max_depth: { type: 'number', description: 'Maximum traversal depth 1-10 (default: 3)' },
        max_results: { type: 'number', description: 'Maximum results (default: 50)' },
        include_source: { type: 'boolean', description: 'Include source code snippets (default: false)' },
        source_lines: { type: 'number', description: 'Lines of source to include (default: 5)' },
      },
      required: ['start'],
    },
  },
];

export function handleCodeTraverse(args: Record<string, unknown>, adapter: DatabaseAdapter, workspace: string, projectId?: string): string {
  const start = args.start as string;
  if (!start) return JSON.stringify({ error: 'Parameter "start" is required' });
  const edgeTypes = (args.edge_types as string[]) ?? [];
  const nodeTypes = (args.node_types as string[]) ?? [];
  const direction = (args.direction as 'outgoing' | 'incoming' | 'both') ?? 'outgoing';
  const maxDepth = Math.min(Math.max((args.max_depth as number) ?? 3, 1), 10);
  const maxResults = Math.min((args.max_results as number) ?? 50, 200);
  const includeSource = (args.include_source as boolean) ?? false;
  const sourceLines = (args.source_lines as number) ?? 5;

  const resolver = new SymbolResolver(adapter, projectId);
  const traverser = new GraphTraverser(adapter, resolver, workspace, projectId);

  const startNode = traverser.resolveNode(start);
  if (!startNode) {
    const suggestions = resolver.suggest(start);
    if (suggestions.length > 0) {
      return `Symbol "${start}" not found. Did you mean: ${suggestions.join(', ')}?`;
    }
    return `Symbol "${start}" not found in index.`;
  }

  const config: TraverseConfig = { edgeTypes, nodeTypes, direction, maxDepth, maxResults };
  const startTime = Date.now();
  const results = traverser.traverse(startNode, config);
  const executionTimeMs = Date.now() - startTime;

  if (results.length === 0) {
    return `No connected nodes found from "${start}" with the given filters (direction: ${direction}, edge_types: ${edgeTypes.length > 0 ? edgeTypes.join(',') : 'all'}, node_types: ${nodeTypes.length > 0 ? nodeTypes.join(',') : 'all'})`;
  }

  const response = traverser.formatResponse(startNode, results, includeSource, sourceLines, executionTimeMs);
  return JSON.stringify(response, null, 2);
}
