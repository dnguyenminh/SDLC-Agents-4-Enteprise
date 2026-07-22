/**
 * Read-tool handlers for Code Intelligence.
 * SA4E-53: All QueryLayer calls are now async.
 */
import * as fs from 'fs';
import * as path from 'path';
import { QueryLayer } from '../query/query-layer.js';
import { IndexingEngine } from '../indexer/indexing-engine.js';
import { resolveWithinWorkspace } from '../../shared/path-safety.js';
import { requireProjectId } from '../query/code-intel-isolation.js';

export async function handleCodeSearch(args: Record<string, unknown>, ql: QueryLayer, projectId?: string): Promise<string> {
  const query = (args.query as string) ?? '';
  const limit = (args.limit as number) ?? 20;
  const results = await ql.searchCode(projectId, query, limit);
  if (results.length === 0) return `No results found for "${query}"`;
  const lines = [`Found ${results.length} results for "${query}":\n`];
  for (const r of results) {
    lines.push(`[${r.kind}] ${r.name}`);
    lines.push(`  File: ${r.filePath}:${r.startLine}`);
    if (r.signature) lines.push(`  Sig: ${r.signature.slice(0, 120)}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function handleCodeSymbols(args: Record<string, unknown>, ql: QueryLayer, projectId?: string): Promise<string> {
  const name = args.name as string | undefined;
  const file = args.file as string | undefined;
  const kind = args.kind as string | undefined;
  const limit = (args.limit as number) ?? 50;
  if (file) return formatFileSymbols(ql, projectId, file);
  if (name) return formatNameSymbols(ql, projectId, name, kind, limit);
  return 'Provide either "name" or "file" parameter';
}

async function formatFileSymbols(ql: QueryLayer, projectId: string | undefined, file: string): Promise<string> {
  const symbols = await ql.getFileSymbols(projectId, file);
  if (symbols.length === 0) return `No symbols found in ${file}`;
  const lines = [`Symbols in ${file} (${symbols.length}):\n`];
  for (const s of symbols) lines.push(`  L${s.startLine} [${s.kind}] ${s.name}`);
  return lines.join('\n');
}

async function formatNameSymbols(ql: QueryLayer, projectId: string | undefined, name: string, kind: string | undefined, limit: number): Promise<string> {
  const symbols = await ql.findSymbols(projectId, name, kind, limit);
  if (symbols.length === 0) return `No symbols matching "${name}"`;
  const lines = [`Found ${symbols.length} symbols matching "${name}":\n`];
  for (const s of symbols) lines.push(`[${s.kind}] ${s.name} - ${s.filePath}:${s.startLine}`);
  return lines.join('\n');
}

export async function handleCodeContext(args: Record<string, unknown>, ql: QueryLayer, workspace: string, projectId?: string): Promise<string> {
  const file = args.file as string;
  if (!file) return 'Parameter "file" is required';
  const fullPath = resolveWithinWorkspace(workspace, file);
  if (!fullPath) return `Invalid path: ${file}`;
  if (!fs.existsSync(fullPath)) return `File not found: ${file}`;
  const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
  const contextLines = (args.contextLines as number) ?? 5;
  const symbol = args.symbol as string | undefined;
  if (symbol) return symbolContext(ql, projectId, file, symbol, lines, contextLines);
  const startLine = args.startLine as number | undefined;
  const endLine = args.endLine as number | undefined;
  const start = Math.max(0, (startLine ?? 1) - 1 - contextLines);
  const end = Math.min(lines.length, (endLine ?? startLine ?? lines.length) + contextLines);
  return formatLines(lines, start, end, file);
}

async function symbolContext(ql: QueryLayer, projectId: string | undefined, file: string, symbol: string, lines: string[], contextLines: number): Promise<string> {
  const syms = await ql.getFileSymbols(projectId, file);
  const match = syms.find(s => s.name === symbol);
  if (!match) return `Symbol "${symbol}" not found in ${file}`;
  const start = Math.max(0, match.startLine - 1 - contextLines);
  const end = Math.min(lines.length, match.endLine + contextLines);
  return formatLines(lines, start, end, file);
}

export async function handleCodeModules(args: Record<string, unknown>, ql: QueryLayer, projectId?: string): Promise<string> {
  const name = args.name as string | undefined;
  const modules = await ql.listModulesWithPatterns(projectId, name ?? null);
  if (modules.length === 0) return 'No modules indexed yet.';
  const lines = [`Modules (${modules.length}):\n`];
  for (const m of modules) {
    lines.push(`📦 ${m.name}`);
    lines.push(`   Path: ${m.rootPath}`);
    if (m.language) lines.push(`   Lang: ${m.language}`);
    lines.push(`   Files: ${m.fileCount} | Symbols: ${m.symbolCount}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function handleCodeIndexStatus(args: Record<string, unknown>, ql: QueryLayer, indexer: IndexingEngine, workspace: string, projectId?: string): Promise<string> {
  if (args.reindex) await indexer.runFullIndex(projectId ? { projectId, workspace } : undefined);
  const status = await ql.getIndexStatus(projectId);
  return [
    'Code Intelligence Index Status\n',
    `State: ${indexer.isRunning(projectId) ? 'Indexing...' : 'Idle'}`,
    `Files: ${status.totalFiles}`,
    `Symbols: ${status.totalSymbols}`,
    `Modules: ${status.totalModules}`,
  ].join('\n');
}

export function handleStreamWriteFile(args: Record<string, unknown>, workspace: string, projectId?: string): string {
  const rawPath = args.file_path as string;
  if (!rawPath) return '{"error":"file_path is required"}';
  try { requireProjectId(projectId); } catch { return JSON.stringify({ error: 'PROJECT_REQUIRED: X-Project-Id needed to write files' }); }
  const mode = (args.mode as string) ?? 'write';
  const content = (args.content as string) ?? '';
  const filePath = resolveWithinWorkspace(workspace, rawPath);
  if (!filePath) return JSON.stringify({ error: `Invalid or out-of-workspace path: ${rawPath}` });
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (mode === 'append') fs.appendFileSync(filePath, content, 'utf-8');
  else fs.writeFileSync(filePath, content, 'utf-8');
  return JSON.stringify({ file_path: filePath, mode });
}

export function handleCodeKbExport(_args: Record<string, unknown>, _ql: QueryLayer, _workspace: string): string {
  return JSON.stringify({ status: 'exported' });
}

function formatLines(lines: string[], start: number, end: number, file: string): string {
  const numbered = lines.slice(start, end).map((line, i) => `${String(start + i + 1).padStart(4)} | ${line}`);
  return `// ${file} [${start + 1}-${end}]\n${numbered.join('\n')}`;
}
