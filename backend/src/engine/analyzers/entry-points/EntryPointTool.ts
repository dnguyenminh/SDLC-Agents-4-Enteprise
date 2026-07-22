/**
 * KSA-162: MCP Tool registration for find_entry_points.
 * SA4E-45: Refactored to accept DatabaseAdapter.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { EntryPointDetector } from './EntryPointDetector.js';
import type { EntryType } from './types.js';

export const ENTRY_POINT_TOOL_DEFINITION = {
  name: 'find_entry_points',
  description: 'Find HTTP handlers, main functions, CLI commands, and event handlers in the codebase.',
  inputSchema: {
    type: 'object',
    properties: {
      entry_type: { type: 'string', description: 'Filter: HTTP_HANDLER, MAIN, CLI_COMMAND, EVENT_HANDLER, SCHEDULED' },
      framework: { type: 'string', description: 'Filter by framework (express, nestjs, spring, fastapi, ktor, gin)' },
      http_method: { type: 'string', description: 'Filter by HTTP method (GET, POST, PUT, DELETE, PATCH)' },
      route_pattern: { type: 'string', description: 'Filter by route pattern (partial match)' },
      has_auth: { type: 'boolean', description: 'Filter by auth presence' },
      file_path: { type: 'string', description: 'Filter by file path' },
      limit: { type: 'number', description: 'Max results (default: 30)' },
    },
  },
};

/** Handle find_entry_points tool call (SA4E-41: tenant-scoped, fail-closed). */
export async function handleEntryPointTool(args: Record<string, unknown>, adapter: DatabaseAdapter, projectId?: string): Promise<string> {
  const detector = new EntryPointDetector(adapter, projectId);

  const result = await detector.query({
    entryType: args.entry_type as EntryType | undefined,
    framework: args.framework as string | undefined,
    httpMethod: args.http_method as string | undefined,
    routePattern: args.route_pattern as string | undefined,
    hasAuth: args.has_auth as boolean | undefined,
    filePath: args.file_path as string | undefined,
    limit: (args.limit as number) ?? 30,
  });

  if (result.results.length === 0) {
    return 'No entry points found. Run indexing to detect entry points.';
  }

  const lines: string[] = [
    `Entry Points — ${result.total} found\n`,
    `By Type: ${Object.entries(result.summary.byType).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `By Framework: ${Object.entries(result.summary.byFramework).map(([k, v]) => `${k}=${v}`).join(' ') || 'N/A'}`,
    `Auth: ${result.summary.authCoverage.withAuth} with auth, ${result.summary.authCoverage.withoutAuth} without\n`,
  ];

  for (const ep of result.results) {
    if (ep.entry_type === 'HTTP_HANDLER') {
      const auth = ep.has_auth ? ' 🔒' : '';
      lines.push(`  ${ep.http_method} ${ep.full_route}${auth} → ${ep.symbol_name}`);
      lines.push(`    ${ep.file_path}:${ep.start_line} [${ep.framework}]`);
    } else {
      lines.push(`  [${ep.entry_type}] ${ep.symbol_name}${ep.event_name ? ` (${ep.event_name})` : ''}`);
      lines.push(`    ${ep.file_path}:${ep.start_line}`);
    }
  }

  return lines.join('\n');
}
