/**
 * Tool registration and dispatch for Code Intelligence and Graph Analysis.
 * OCP fix: replaced 28-case switch with a Map-based handler registry.
 * Adding a new code-intel tool requires only: add definition + add registry entry.
 *
 * DIP fix: QueryLayer and DatabaseAdapter are injected, not created per-call.
 * SA4E-45: All tool handlers accept DatabaseAdapter instead of Database.Database.
 */
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { IndexingEngine } from '../indexer/indexing-engine.js';
import type { QueryLayer } from '../query/query-layer.js';
import type { DatabaseManager } from '../db/database-manager.js';
import { handleDrawioLayout, DRAWIO_TOOL_DEFINITION } from './drawio-tool.js';
import { handleDrawioExportPng, DRAWIO_EXPORT_PNG_DEFINITION } from './drawio-export-png.js';
import { CALL_GRAPH_TOOL_DEFINITIONS, handleCodeCallers, handleCodeCallees } from './call-graph-tools.js';
import { DEPENDENCY_TOOL_DEFINITIONS, handleCodeDependencies } from './dependency-tools.js';
import { IMPACT_TOOL_DEFINITIONS, handleCodeImpact } from './impact-tools.js';
import { TRAVERSE_TOOL_DEFINITIONS, handleCodeTraverse } from './code-traverse.js';
import { COMPLEXITY_TOOL_DEFINITION, handleComplexityTool } from '../analyzers/complexity/ComplexityTool.js';
import { ENTRY_POINT_TOOL_DEFINITION, handleEntryPointTool } from '../analyzers/entry-points/EntryPointTool.js';
import { GRAPH_ANALYSIS_TOOL_DEFINITIONS, handleGraphAnalysisTool } from '../analyzers/graph-analysis/GraphAnalysisTools.js';
import { AI_CONTEXT_TOOL_DEFINITIONS, handleGetAIContext, handleGetEditContext, handleGetCuratedContext } from './ai-context-tools.js';
import { SIMILARITY_TOOL_DEFINITIONS, handleSimilarityTool } from '../analyzers/similarity/SimilarityTools.js';
import {
  handleCodeSearch, handleCodeSymbols, handleCodeContext, handleCodeModules,
  handleCodeIndexStatus, handleStreamWriteFile, handleCodeKbExport,
} from './code-intel-handlers.js';

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

/** Context bag injected into every code-intel tool handler. */
interface CodeIntelContext {
  queryLayer: QueryLayer;
  adapter: DatabaseAdapter;
  dbManager: DatabaseManager | null;
  indexer: IndexingEngine;
  workspace: string;
  projectId?: string;
}

/** All handlers return Promise<string> — sync handlers are wrapped with resolve(). */
type CodeIntelHandlerFn = (args: Record<string, unknown>, ctx: CodeIntelContext) => Promise<string>;

/** Helper: normalise sync-or-async result to Promise<string>. */
function p(v: string | Promise<string> | Promise<string | null> | null | undefined, fallback = 'Unknown tool'): Promise<string> {
  if (v == null) return Promise.resolve(fallback);
  if (typeof v === 'string') return Promise.resolve(v);
  return v.then(r => r ?? fallback);
}

/**
 * OCP registry: tool name -> handler function.
 * To add a new code-intel tool: import its handler and add one line here.
 * dispatchCodeIntelTool() requires NO changes.
 */
const TOOL_HANDLER_REGISTRY: Record<string, CodeIntelHandlerFn> = {
  code_search:        (a, ctx) => p(handleCodeSearch(a, ctx.queryLayer, ctx.projectId)),
  code_symbols:       (a, ctx) => p(handleCodeSymbols(a, ctx.queryLayer, ctx.projectId)),
  code_context:       (a, ctx) => p(handleCodeContext(a, ctx.queryLayer, ctx.workspace, ctx.projectId)),
  code_modules:       (a, ctx) => p(handleCodeModules(a, ctx.queryLayer, ctx.projectId)),
  code_index_status:  (a, ctx) => p(handleCodeIndexStatus(a, ctx.queryLayer, ctx.indexer, ctx.workspace, ctx.projectId)),
  stream_write_file:  (a, ctx) => p(handleStreamWriteFile(a, ctx.workspace, ctx.projectId)),
  code_kb_export:     (a, ctx) => p(handleCodeKbExport(a, ctx.queryLayer, ctx.workspace)),
  drawio_auto_layout: (a, ctx) => p(handleDrawioLayout(a, ctx.workspace)),
  drawio_export_png:  (a, ctx) => p(handleDrawioExportPng(a, ctx.workspace, null as any)),
  code_callers:       (a, ctx) => p(handleCodeCallers(a, ctx.adapter, ctx.projectId)),
  code_callees:       (a, ctx) => p(handleCodeCallees(a, ctx.adapter, ctx.projectId)),
  code_dependencies:  (a, ctx) => p(handleCodeDependencies(a, ctx.adapter, ctx.workspace, ctx.projectId)),
  code_impact:        (a, ctx) => p(handleCodeImpact(a, ctx.adapter, ctx.workspace, ctx.projectId)),
  code_traverse:      (a, ctx) => p(handleCodeTraverse(a, ctx.adapter, ctx.workspace, ctx.projectId)),
  complexity_analysis:(a, ctx) => p(handleComplexityTool(a, ctx.adapter, ctx.projectId)),
  find_entry_points:  (a, ctx) => p(handleEntryPointTool(a, ctx.adapter, ctx.projectId)),
  find_circular_deps: (a, ctx) => p(handleGraphAnalysisTool('find_circular_deps', a, ctx.adapter, ctx.projectId), 'Unknown tool: find_circular_deps'),
  find_related_tests: (a, ctx) => p(handleGraphAnalysisTool('find_related_tests', a, ctx.adapter, ctx.projectId), 'Unknown tool: find_related_tests'),
  find_hot_paths:     (a, ctx) => p(handleGraphAnalysisTool('find_hot_paths', a, ctx.adapter, ctx.projectId), 'Unknown tool: find_hot_paths'),
  find_dead_imports:  (a, ctx) => p(handleGraphAnalysisTool('find_dead_imports', a, ctx.adapter, ctx.projectId), 'Unknown tool: find_dead_imports'),
  module_summary:     (a, ctx) => p(handleGraphAnalysisTool('module_summary', a, ctx.adapter, ctx.projectId), 'Unknown tool: module_summary'),
  get_ai_context:     (a, ctx) => p(handleGetAIContext(a, ctx.adapter, ctx.workspace, ctx.projectId)),
  get_edit_context:   (a, ctx) => p(handleGetEditContext(a, ctx.adapter, ctx.workspace, ctx.projectId)),
  get_curated_context:(a, ctx) => p(handleGetCuratedContext(a, ctx.adapter, ctx.workspace, ctx.dbManager, ctx.projectId)),
  find_duplicates:    (a, ctx) => p(handleSimilarityTool('find_duplicates', a, ctx.adapter, ctx.workspace, ctx.projectId), 'Unknown tool: find_duplicates'),
  find_dead_code:     (a, ctx) => p(handleSimilarityTool('find_dead_code', a, ctx.adapter, ctx.workspace, ctx.projectId), 'Unknown tool: find_dead_code'),
  git_search:         (a, ctx) => p(handleSimilarityTool('git_search', a, ctx.adapter, ctx.workspace, ctx.projectId), 'Unknown tool: git_search'),
  git_index:          (a, ctx) => p(handleSimilarityTool('git_index', a, ctx.adapter, ctx.workspace, ctx.projectId), 'Unknown tool: git_index'),
};

/**
 * Dispatch a code-intelligence tool call via the handler registry.
 * OCP: adding a new tool requires only adding to TOOL_HANDLER_REGISTRY above.
 * DIP: QueryLayer and DatabaseAdapter are injected (created once at module init).
 */
export async function dispatchCodeIntelTool(
  name: string,
  args: Record<string, unknown>,
  queryLayer: QueryLayer,
  adapter: DatabaseAdapter,
  dbManager: DatabaseManager | null,
  indexer: IndexingEngine,
  workspace: string,
  projectId?: string,
): Promise<string> {
  const handler = TOOL_HANDLER_REGISTRY[name];
  if (!handler) return `Unknown tool: ${name}`;
  const ctx: CodeIntelContext = { queryLayer, adapter, dbManager, indexer, workspace, projectId };
  return handler(args, ctx);
}
