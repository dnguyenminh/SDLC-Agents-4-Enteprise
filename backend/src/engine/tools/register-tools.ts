/**
 * Tool registration and dispatch for Code Intelligence and Graph Analysis.
 * Read-tool handlers live in ./code-intel-handlers.ts (size split, SA4E-41).
 */
import { DatabaseManager } from '../db/database-manager.js';
import { IndexingEngine } from '../indexer/indexing-engine.js';
import { QueryLayer } from '../query/query-layer.js';
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

export async function dispatchCodeIntelTool(
  name: string,
  args: Record<string, unknown>,
  dbManager: DatabaseManager,
  indexer: IndexingEngine,
  workspace: string,
  projectId?: string
): Promise<string> {
  const queryLayer = new QueryLayer(dbManager);
  const db = () => dbManager.getDb();
  switch (name) {
    case 'code_search': return handleCodeSearch(args, queryLayer, projectId);
    case 'code_symbols': return handleCodeSymbols(args, queryLayer, projectId);
    case 'code_context': return handleCodeContext(args, queryLayer, workspace, projectId);
    case 'code_modules': return handleCodeModules(args, queryLayer, projectId);
    case 'code_index_status': return handleCodeIndexStatus(args, queryLayer, indexer, workspace, projectId);
    case 'stream_write_file': return handleStreamWriteFile(args, workspace, projectId);
    case 'code_kb_export': return handleCodeKbExport(args, queryLayer, workspace);
    case 'drawio_auto_layout': return handleDrawioLayout(args, workspace);
    case 'drawio_export_png': return handleDrawioExportPng(args, workspace, null as any);
    // SA4E-41 SEC-01: thread projectId into every graph/analysis tool (fail-closed).
    case 'code_callers': return handleCodeCallers(args, db(), projectId);
    case 'code_callees': return handleCodeCallees(args, db(), projectId);
    case 'code_dependencies': return handleCodeDependencies(args, db(), workspace, projectId);
    case 'code_impact': return handleCodeImpact(args, db(), workspace, projectId);
    case 'code_traverse': return handleCodeTraverse(args, db(), workspace, projectId);
    case 'complexity_analysis': return handleComplexityTool(args, db(), projectId);
    case 'find_entry_points': return handleEntryPointTool(args, db(), projectId);
    case 'find_circular_deps':
    case 'find_related_tests':
    case 'find_hot_paths':
    case 'find_dead_imports':
    case 'module_summary':
      return handleGraphAnalysisTool(name, args, db(), projectId) ?? `Unknown tool: ${name}`;
    case 'get_ai_context': return handleGetAIContext(args, db(), workspace, projectId);
    case 'get_edit_context': return handleGetEditContext(args, db(), workspace, projectId);
    case 'get_curated_context': return handleGetCuratedContext(args, db(), workspace, dbManager, projectId);
    case 'find_duplicates':
    case 'find_dead_code':
    case 'git_search':
    case 'git_index':
      return handleSimilarityTool(name, args, db(), workspace, projectId) ?? `Unknown tool: ${name}`;
    default:
      return `Unknown tool: ${name}`;
  }
}
