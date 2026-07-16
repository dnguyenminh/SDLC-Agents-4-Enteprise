/**
 * code_kb_export tool — Export code intelligence data as KB payloads.
 * Returns structured data ready for kb_ingest consumption.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ModuleInfo, QueryLayer } from '../query/query-layer.js';

export function registerCodeKbExport(server: McpServer, queryLayer: QueryLayer, workspace: string): void {
  server.tool(
    'code_kb_export',
    'Export code intelligence data as Knowledge Base payloads for ingestion. Returns structured data ready for kb_ingest.',
    {
      module: z.string().optional().describe('Filter by module name (optional, exports all if omitted)'),
      format: z.string().optional().describe('Output format: json (default) or text'),
      __projectId: z.string().optional().describe('SA4E-41 tenant scope (injected)'),
    },
    async ({ module, format, __projectId }) => {
      const modules = queryLayer.listModulesWithPatterns(__projectId, module ?? null);
      const projectName = extractProjectName(workspace);
      const outputFormat = format ?? 'json';
      const text = outputFormat === 'text'
        ? formatAsText(modules, projectName)
        : formatAsJson(modules, projectName);
      return { content: [{ type: 'text', text }] };
    }
  );
}

function extractProjectName(workspace: string): string {
  const parts = workspace.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || 'unknown';
}

interface KbPayload {
  title: string;
  content: string;
  tags: string;
  project: string;
}

function buildPayload(m: ModuleInfo, projectName: string): KbPayload {
  const contentLines = [
    `Module: ${m.name}`,
    `Language: ${m.language ?? 'unknown'}`,
    `Purpose: ${m.purpose ?? 'unknown'}`,
    `Files: ${m.fileCount}`,
    `Symbols: ${m.symbolCount}`,
    '',
    'Patterns:',
    `  DI Style: ${m.diStyle ?? 'unknown'}`,
    `  Error Handling: ${m.errorHandling ?? 'unknown'}`,
    `  Naming: ${m.namingConvention ?? 'unknown'}`,
    `  Logging: ${m.loggingFramework ?? 'unknown'}`,
    `  Testing: ${m.testingFramework ?? 'unknown'}`,
  ];
  const tags = ['code-index', m.name, m.language ?? 'unknown'].join(', ');
  return {
    title: `Code Index — ${m.name}`,
    content: contentLines.join('\n'),
    tags,
    project: projectName,
  };
}

function formatAsJson(modules: ModuleInfo[], projectName: string): string {
  if (modules.length === 0) return '[]';
  const payloads = modules.map(m => buildPayload(m, projectName));
  return JSON.stringify(payloads, null, 2);
}

function formatAsText(modules: ModuleInfo[], projectName: string): string {
  if (modules.length === 0) return 'No modules indexed yet. Run indexing first.';
  const payloads = modules.map(m => buildPayload(m, projectName));
  const lines: string[] = [];
  for (const p of payloads) {
    lines.push(`--- ${p.title} ---`);
    lines.push(p.content);
    lines.push(`Tags: ${p.tags}`);
    lines.push(`Project: ${p.project}`);
    lines.push('');
  }
  return lines.join('\n');
}
