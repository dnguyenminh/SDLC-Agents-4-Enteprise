/**
 * code_symbol_locate — SA4E-360 NEW thin MCP tool (TDD §4.2, C-360-R2, DISC-1).
 *
 * THIN by design (BR-11): serialization only — all resolution logic lives in
 * the existing QueryLayer (locateSymbol/listClassMethods, §4.2 SQL). read_method
 * needs structured bounds (endLine/line_count) the text-only code_symbols
 * output cannot carry, so this tool emits a compact JSON envelope.
 *
 * Security: tenant scope via injected __projectId (SA4E-41, fail-closed);
 * equality-based matching (no LIKE wildcard vector); bounded LIMIT.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { QueryLayer } from '../query/query-layer.js';

export const CODE_LOCATE_TOOL_DEFINITION = {
  name: 'code_symbol_locate',
  description:
    'Locate a method/function symbol within its enclosing class/interface and return exact slice bounds ' +
    '(startLine, endLine, lineCount). Used by read_method; returns a compact JSON envelope { rows, classMethods? }.',
  inputSchema: {
    type: 'object',
    properties: {
      class: { type: 'string', description: 'Enclosing class/interface name as indexed' },
      method: { type: 'string', description: 'Method/function name as indexed' },
      limit: { type: 'number', description: 'Max rows (default 25)' },
      __projectId: { type: 'string', description: 'SA4E-41 tenant scope (injected)' },
    },
    required: ['class', 'method'],
  },
} as const;

/** Thin handler — JSON envelope { rows, classMethods? } (AF-4 in ONE call). */
export async function handleCodeLocate(
  args: Record<string, unknown>,
  queryLayer: QueryLayer,
  projectId?: string
): Promise<string> {
  const cls = typeof args.class === 'string' ? args.class : '';
  const method = typeof args.method === 'string' ? args.method : '';
  if (!cls || !method) return JSON.stringify({ rows: [], error: 'class and method are required' });
  const limit = typeof args.limit === 'number' ? args.limit : 25;
  const rows = await queryLayer.locateSymbol(projectId, cls, method, limit);
  const payload: { rows: unknown[]; classMethods?: string[] } = { rows };
  if (rows.length === 0) {
    const classMethods = await queryLayer.listClassMethods(projectId, cls, 10);
    if (classMethods.length > 0) payload.classMethods = classMethods; // class matched, method missing
  }
  return JSON.stringify(payload);
}

/** MCP-SDK registration twin (same shape as code-symbols.ts registerCodeSymbols). */
export function registerCodeLocate(server: McpServer, queryLayer: QueryLayer): void {
  server.tool(
    'code_symbol_locate',
    'Locate a method/function within its enclosing class; returns JSON { rows, classMethods? } with exact slice bounds.',
    {
      class: z.string().min(1).describe('Enclosing class/interface name as indexed'),
      method: z.string().min(1).describe('Method/function name as indexed'),
      limit: z.number().optional().default(25).describe('Max rows'),
      __projectId: z.string().optional().describe('SA4E-41 tenant scope (injected)'),
    },
    async ({ class: cls, method, limit, __projectId }) => ({
      content: [{ type: 'text', text: await handleCodeLocate({ class: cls, method, limit }, queryLayer, __projectId) }],
    })
  );
}
