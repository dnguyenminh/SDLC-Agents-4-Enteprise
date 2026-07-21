/**
 * KSA-155: MCP Tool Registration for code_dependencies.
 * SA4E-45: Refactored to use DatabaseAdapter abstraction.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { FileResolver } from '../graph/file-resolver.js';
import { DependencyGraphService } from '../graph/dependency-graph-service.js';
import { formatDependencyResult } from '../graph/dependency-formatters.js';

export const DEPENDENCY_TOOL_DEFINITIONS = [
  {
    name: 'code_dependencies',
    description: 'Analyze file/module import dependencies with direction and depth control. Shows what a file imports (outgoing) or what imports it (incoming).',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path to analyze (relative or absolute)' },
        direction: { type: 'string', enum: ['incoming', 'outgoing', 'both'], description: 'Direction of dependency analysis (default: outgoing)' },
        depth: { type: 'number', description: 'Traversal depth 1-5 (default: 1)' },
        include_external: { type: 'boolean', description: 'Include external/stdlib dependencies (default: false)' },
        format: { type: 'string', enum: ['tree', 'flat', 'graph'], description: 'Output format (default: tree)' },
        limit: { type: 'number', description: 'Max results (default: 50)' },
      },
      required: ['file'],
    },
  },
];

export function handleCodeDependencies(args: Record<string, unknown>, adapter: DatabaseAdapter, workspace: string, projectId?: string): string {
  const file = args.file as string;
  if (!file) return JSON.stringify({ error: 'Parameter "file" is required' });
  const direction = (args.direction as 'incoming' | 'outgoing' | 'both') ?? 'outgoing';
  const depth = (args.depth as number) ?? 1;
  const includeExternal = (args.include_external as boolean) ?? false;
  const format = (args.format as string) ?? 'tree';
  const limit = (args.limit as number) ?? 50;

  const fileResolver = new FileResolver(adapter, workspace, projectId);
  const service = new DependencyGraphService(adapter, fileResolver, projectId);
  const result = service.query(file, direction, depth, includeExternal, limit);

  if (result.results.length === 0 && result.root === file) {
    return `File "${file}" not found in index. Make sure the file has been indexed.`;
  }
  if (result.results.length === 0) {
    return `No ${direction} dependencies found for "${result.root}"`;
  }
  const formatted = formatDependencyResult(result, format);
  return JSON.stringify(formatted, null, 2);
}
