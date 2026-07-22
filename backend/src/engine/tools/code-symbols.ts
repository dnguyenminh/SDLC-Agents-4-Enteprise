/**
 * code_symbols tool — Lookup symbols by name, kind, or file path.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { QueryLayer } from '../query/query-layer.js';

export function registerCodeSymbols(server: McpServer, queryLayer: QueryLayer): void {
  server.tool(
    'code_symbols',
    'Find code symbols by name prefix or list symbols in a file. Filter by kind (function, class, interface, etc).',
    {
      name: z.string().optional().describe('Symbol name or prefix to search'),
      file: z.string().optional().describe('File path to list symbols from'),
      kind: z.string().optional().describe('Filter by kind: function, class, interface, enum, type, method'),
      limit: z.number().optional().default(50).describe('Max results'),
      __projectId: z.string().optional().describe('SA4E-41 tenant scope (injected)'),
    },
    async ({ name, file, kind, limit, __projectId }) => {
      let text: string;
      if (file) {
        const symbols = await queryLayer.getFileSymbols(__projectId, file);
        text = formatFileSymbols(file, symbols);
      } else if (name) {
        const symbols = await queryLayer.findSymbols(__projectId, name, kind, limit);
        text = formatSymbolList(symbols, name);
      } else {
        text = 'Provide either "name" or "file" parameter';
      }
      return { content: [{ type: 'text', text }] };
    }
  );
}

function formatFileSymbols(file: string, symbols: any[]): string {
  if (symbols.length === 0) return `No symbols found in ${file}`;
  const lines = [`Symbols in ${file} (${symbols.length}):\n`];
  for (const s of symbols) {
    const vis = s.visibility ? `[${s.visibility}] ` : '';
    lines.push(`  L${s.startLine} ${vis}${s.kind} ${s.name}`);
  }
  return lines.join('\n');
}

function formatSymbolList(symbols: any[], query: string): string {
  if (symbols.length === 0) return `No symbols matching "${query}"`;
  const lines = [`Found ${symbols.length} symbols matching "${query}":\n`];
  for (const s of symbols) {
    lines.push(`[${s.kind}] ${s.name} — ${s.filePath}:${s.startLine}`);
    if (s.signature) lines.push(`  ${s.signature.slice(0, 120)}`);
  }
  return lines.join('\n');
}
