/**
 * code_context tool — Get surrounding context for a symbol or file region.
 * Reads actual source code lines around a symbol definition.
 */

import * as fs from 'fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { QueryLayer } from '../query/query-layer.js';
import { resolveWithinWorkspace } from '../../shared/path-safety.js';

export function registerCodeContext(
  server: McpServer, queryLayer: QueryLayer, workspace: string
): void {
  server.tool(
    'code_context',
    'Get source code context around a symbol or line range. Returns actual code lines from the file.',
    {
      file: z.string().describe('Relative file path'),
      symbol: z.string().optional().describe('Symbol name to find in file'),
      startLine: z.number().optional().describe('Start line (1-based)'),
      endLine: z.number().optional().describe('End line (1-based)'),
      contextLines: z.number().optional().default(5).describe('Extra lines above/below'),
      __projectId: z.string().optional().describe('SA4E-41 tenant scope (injected)'),
    },
    async ({ file, symbol, startLine, endLine, contextLines, __projectId }) => {
      const text = await getContext(workspace, file, symbol, startLine, endLine, contextLines, queryLayer, __projectId);
      return { content: [{ type: 'text', text }] };
    }
  );
}

async function getContext(
  workspace: string, file: string, symbol: string | undefined,
  startLine: number | undefined, endLine: number | undefined,
  contextLines: number, queryLayer: QueryLayer, projectId?: string
): Promise<string> {
  // SEC-04: reject absolute/traversal/null-byte paths and confirm containment.
  const fullPath = resolveWithinWorkspace(workspace, file);
  if (!fullPath) return `Invalid path: ${file}`;
  if (!fs.existsSync(fullPath)) return `File not found: ${file}`;

  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');

  if (symbol) {
    return getSymbolContext(file, symbol, lines, contextLines, queryLayer, projectId);
  }

  const start = Math.max(0, (startLine ?? 1) - 1 - contextLines);
  const end = Math.min(lines.length, (endLine ?? startLine ?? lines.length) + contextLines);
  return formatLines(lines, start, end, file);
}

async function getSymbolContext(
  file: string, symbol: string, lines: string[],
  contextLines: number, queryLayer: QueryLayer, projectId?: string
): Promise<string> {
  const symbols = await queryLayer.getFileSymbols(projectId, file);
  const match = symbols.find(s => s.name === symbol);
  if (!match) return `Symbol "${symbol}" not found in ${file}`;

  const start = Math.max(0, match.startLine - 1 - contextLines);
  const end = Math.min(lines.length, match.endLine + contextLines);
  return formatLines(lines, start, end, file);
}

function formatLines(lines: string[], start: number, end: number, file: string): string {
  const numbered = lines
    .slice(start, end)
    .map((line, i) => `${String(start + i + 1).padStart(4)} | ${line}`);
  return `// ${file} [${start + 1}-${end}]\n${numbered.join('\n')}`;
}
