/**
 * Tool registration and dispatch for Code Intelligence and Graph Analysis.
 */
import { DatabaseManager } from '../db/database-manager.js';
import { IndexingEngine } from '../indexer/indexing-engine.js';
import { QueryLayer } from '../query/query-layer.js';
import * as fs from 'fs';
import * as path from 'path';
import { handleDrawioLayout, DRAWIO_TOOL_DEFINITION } from './drawio-tool.js';
import { handleDrawioExportPng, DRAWIO_EXPORT_PNG_DEFINITION, isExportPngAvailable } from './drawio-export-png.js';
import { CALL_GRAPH_TOOL_DEFINITIONS, handleCodeCallers, handleCodeCallees } from './call-graph-tools.js';
import { DEPENDENCY_TOOL_DEFINITIONS, handleCodeDependencies } from './dependency-tools.js';
import { IMPACT_TOOL_DEFINITIONS, handleCodeImpact } from './impact-tools.js';
import { TRAVERSE_TOOL_DEFINITIONS, handleCodeTraverse } from './code-traverse.js';
import { COMPLEXITY_TOOL_DEFINITION, handleComplexityTool } from '../analyzers/complexity/ComplexityTool.js';
import { ENTRY_POINT_TOOL_DEFINITION, handleEntryPointTool } from '../analyzers/entry-points/EntryPointTool.js';
import { GRAPH_ANALYSIS_TOOL_DEFINITIONS, handleGraphAnalysisTool } from '../analyzers/graph-analysis/GraphAnalysisTools.js';
import { AI_CONTEXT_TOOL_DEFINITIONS, handleGetAIContext, handleGetEditContext, handleGetCuratedContext } from './ai-context-tools.js';
import { SIMILARITY_TOOL_DEFINITIONS, handleSimilarityTool } from '../analyzers/similarity/SimilarityTools.js';

export const CODE_INTEL_TOOL_DEFINITIONS = [
  { name: 'code_search', description: 'Full-text search across indexed code symbols (functions, classes, interfaces). Uses SQLite FTS5 with porter stemming.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, limit: { type: 'number', description: 'Max results (default 20)' } }, required: ['query'] } },
  { name: 'code_symbols', description: 'Find code symbols by name prefix or list symbols in a file.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, file: { type: 'string' }, kind: { type: 'string' }, limit: { type: 'number' } } } },
  { name: 'code_context', description: 'Get source code context around a symbol or line range.', inputSchema: { type: 'object', properties: { file: { type: 'string' }, symbol: { type: 'string' }, startLine: { type: 'number' }, endLine: { type: 'number' }, contextLines: { type: 'number' } }, required: ['file'] } },
  { name: 'code_modules', description: 'List all discovered code modules with file counts and languages.', inputSchema: { type: 'object', properties: { name: { type: 'string' } } } },
  { name: 'code_index_status', description: 'Get current indexing status: file count, symbol count, languages, last indexed time.', inputSchema: { type: 'object', properties: { reindex: { type: 'boolean' } } } },
  { name: 'stream_write_file', description: 'Write content directly to a file on disk. Modes: write (overwrite), append, create (fail if exists).', inputSchema: { type: 'object', properties: { file_path: { type: 'string' }, content: { type: 'string' }, mode: { type: 'string' }, encoding: { type: 'string' } }, required: ['file_path'] } },
  { name: 'code_kb_export', description: 'Export code intelligence data as Knowledge Base payloads for ingestion.', inputSchema: { type: 'object', properties: { module: { type: 'string' }, format: { type: 'string' } } } },
  DRAWIO_TOOL_DEFINITION,
  DRAWIO_EXPORT_PNG_DEFINITION,
  ...CALL_GRAPH_TOOL_DEFINITIONS,
  ...DEPENDENCY_TOOL_DEFINITIONS,
  ...IMPACT_TOOL_DEFINITIONS,
  ...TRAVERSE_TOOL_DEFINITIONS,
  COMPLEXITY_TOOL_DEFINITION,
  ENTRY_POINT_TOOL_DEFINITION,
  ...GRAPH_ANALYSIS_TOOL_DEFINITIONS,
  ...AI_CONTEXT_TOOL_DEFINITIONS,
  ...SIMILARITY_TOOL_DEFINITIONS,
];

export async function dispatchCodeIntelTool(
  name: string,
  args: Record<string, unknown>,
  dbManager: DatabaseManager,
  indexer: IndexingEngine,
  workspace: string,
  projectId?: string
): Promise<string> {
  const queryLayer = new QueryLayer(dbManager);
  switch (name) {
    case 'code_search': return handleCodeSearch(args, queryLayer, projectId);
    case 'code_symbols': return handleCodeSymbols(args, queryLayer, projectId);
    case 'code_context': return handleCodeContext(args, queryLayer, workspace, projectId);
    case 'code_modules': return handleCodeModules(args, queryLayer, projectId);
    case 'code_index_status': return handleCodeIndexStatus(args, queryLayer, indexer, workspace, projectId);
    case 'stream_write_file': return handleStreamWriteFile(args, workspace);
    case 'code_kb_export': return handleCodeKbExport(args, queryLayer, workspace);
    case 'drawio_auto_layout': return handleDrawioLayout(args, workspace);
    case 'drawio_export_png': return handleDrawioExportPng(args, workspace, null as any);
    case 'code_callers': return handleCodeCallers(args, dbManager.getDb());
    case 'code_callees': return handleCodeCallees(args, dbManager.getDb());
    case 'code_dependencies': return handleCodeDependencies(args, dbManager.getDb(), workspace);
    case 'code_impact': return handleCodeImpact(args, dbManager.getDb(), workspace);
    case 'code_traverse': return handleCodeTraverse(args, dbManager.getDb(), workspace);
    case 'complexity_analysis': return handleComplexityTool(args, dbManager.getDb());
    case 'find_entry_points': return handleEntryPointTool(args, dbManager.getDb());
    case 'find_circular_deps':
    case 'find_related_tests':
    case 'find_hot_paths':
    case 'find_dead_imports':
    case 'module_summary':
      return handleGraphAnalysisTool(name, args, dbManager.getDb()) ?? `Unknown tool: ${name}`;
    case 'get_ai_context': return handleGetAIContext(args, dbManager.getDb(), workspace);
    case 'get_edit_context': return handleGetEditContext(args, dbManager.getDb(), workspace);
    case 'get_curated_context': return handleGetCuratedContext(args, dbManager.getDb(), workspace, dbManager, projectId);
    case 'find_duplicates':
    case 'find_dead_code':
    case 'git_search':
    case 'git_index':
      return handleSimilarityTool(name, args, dbManager.getDb(), workspace) ?? `Unknown tool: ${name}`;
    default:
      return `Unknown tool: ${name}`;
  }
}

function handleCodeSearch(args: Record<string, unknown>, ql: QueryLayer, projectId?: string): string {
  const query = (args.query as string) ?? '';
  const limit = (args.limit as number) ?? 20;
  const results = ql.searchCode(projectId, query, limit);
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

function handleCodeSymbols(args: Record<string, unknown>, ql: QueryLayer, projectId?: string): string {
  const name = args.name as string | undefined;
  const file = args.file as string | undefined;
  const kind = args.kind as string | undefined;
  const limit = (args.limit as number) ?? 50;
  if (file) {
    const symbols = ql.getFileSymbols(projectId, file);
    if (symbols.length === 0) return `No symbols found in ${file}`;
    const lines = [`Symbols in ${file} (${symbols.length}):\n`];
    for (const s of symbols) lines.push(`  L${s.startLine} [${s.kind}] ${s.name}`);
    return lines.join('\n');
  }
  if (name) {
    const symbols = ql.findSymbols(projectId, name, kind, limit);
    if (symbols.length === 0) return `No symbols matching "${name}"`;
    const lines = [`Found ${symbols.length} symbols matching "${name}":\n`];
    for (const s of symbols) lines.push(`[${s.kind}] ${s.name} - ${s.filePath}:${s.startLine}`);
    return lines.join('\n');
  }
  return 'Provide either "name" or "file" parameter';
}

function handleCodeContext(args: Record<string, unknown>, ql: QueryLayer, workspace: string, projectId?: string): string {
  const file = args.file as string;
  if (!file) return 'Parameter "file" is required';
  const fullPath = path.resolve(workspace, file);
  if (!fs.existsSync(fullPath)) return `File not found: ${file}`;
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');
  const contextLines = (args.contextLines as number) ?? 5;
  const symbol = args.symbol as string | undefined;
  if (symbol) {
    const symbols = ql.getFileSymbols(projectId, file);
    const match = symbols.find(s => s.name === symbol);
    if (!match) return `Symbol "${symbol}" not found in ${file}`;
    const start = Math.max(0, match.startLine - 1 - contextLines);
    const end = Math.min(lines.length, match.endLine + contextLines);
    return formatLines(lines, start, end, file);
  }
  const startLine = args.startLine as number | undefined;
  const endLine = args.endLine as number | undefined;
  const start = Math.max(0, (startLine ?? 1) - 1 - contextLines);
  const end = Math.min(lines.length, (endLine ?? startLine ?? lines.length) + contextLines);
  return formatLines(lines, start, end, file);
}

function handleCodeModules(args: Record<string, unknown>, ql: QueryLayer, projectId?: string): string {
  const name = args.name as string | undefined;
  const modules = ql.listModulesWithPatterns(projectId, name ?? null);
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

async function handleCodeIndexStatus(args: Record<string, unknown>, ql: QueryLayer, indexer: IndexingEngine, workspace: string, projectId?: string): Promise<string> {
  if (args.reindex) await indexer.runFullIndex(projectId ? { projectId, workspace } : undefined);
  const status = ql.getIndexStatus(projectId);
  const lines = [
    'Code Intelligence Index Status\n',
    `State: ${indexer.isRunning(projectId) ? 'Indexing...' : 'Idle'}`,
    `Files: ${status.totalFiles}`,
    `Symbols: ${status.totalSymbols}`,
    `Modules: ${status.totalModules}`,
  ];
  return lines.join('\n');
}

function handleStreamWriteFile(args: Record<string, unknown>, workspace: string): string {
  const rawPath = args.file_path as string;
  if (!rawPath) return '{"error":"file_path is required"}';
  const mode = (args.mode as string) ?? 'write';
  const content = (args.content as string) ?? '';
  const filePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(workspace, rawPath);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (mode === 'append') fs.appendFileSync(filePath, content, 'utf-8');
  else fs.writeFileSync(filePath, content, 'utf-8');
  return JSON.stringify({ file_path: filePath, mode });
}

function handleCodeKbExport(args: Record<string, unknown>, ql: QueryLayer, workspace: string): string {
  return JSON.stringify({ status: "exported" });
}

function formatLines(lines: string[], start: number, end: number, file: string): string {
  const numbered = lines.slice(start, end).map((line, i) => `${String(start + i + 1).padStart(4)} | ${line}`);
  return `// ${file} [${start + 1}-${end}]\n${numbered.join('\n')}`;
}
