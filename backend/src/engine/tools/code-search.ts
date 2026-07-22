/**
 * code_search tool — Full-text search across indexed codebase using FTS5.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { QueryLayer } from '../query/query-layer.js';

export function registerCodeSearch(server: McpServer, queryLayer: QueryLayer): void {
  server.tool(
    'code_search',
    'Full-text search across indexed code symbols (functions, classes, interfaces). Uses SQLite FTS5 with porter stemming.',
    {
      query: z.string().describe('Search query (supports FTS5 syntax: AND, OR, NOT, prefix*)'),
      limit: z.number().optional().default(20).describe('Max results (default 20)'),
      __projectId: z.string().optional().describe('SA4E-41 tenant scope (injected)'),
    },
    async ({ query, limit, __projectId }) => {
      const results = await queryLayer.searchCode(__projectId, query, limit);
      const text = formatSearchResults(results, query);
      return { content: [{ type: 'text', text }] };
    }
  );
}

function formatSearchResults(results: any[], query: string): string {
  if (results.length === 0) {
    return `No results found for "${query}"`;
  }

  const lines = [`Found ${results.length} results for "${query}":\n`];
  for (const r of results) {
    lines.push(`[${r.kind}] ${r.name}`);
    lines.push(`  File: ${r.filePath}:${r.startLine}`);
    if (r.signature) lines.push(`  Sig: ${r.signature.slice(0, 120)}`);
    if (r.docComment) lines.push(`  Doc: ${r.docComment.slice(0, 100)}`);
    lines.push('');
  }
  return lines.join('\n');
}
