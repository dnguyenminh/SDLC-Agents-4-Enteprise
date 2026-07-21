/**
 * KSA-158/159/160: AI Context MCP tool handlers and definitions.
 * SA4E-45: Refactored to use DatabaseAdapter abstraction.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { SymbolResolver } from '../graph/symbol-resolver.js';
import { CallGraphService } from '../graph/call-graph-service.js';
import { TestDetector } from '../graph/test-detector.js';
import { GraphTraverser } from '../graph/traverser.js';
import { GraphRepository } from '../database/graph-repository.js';
import { QueryLayer } from '../query/query-layer.js';
import { AIContextService } from '../context/ai-context-service.js';
import { EditContextService } from '../context/edit-context-service.js';
import { CuratedContextService } from '../context/curated-context-service.js';
import { DatabaseManager } from '../db/database-manager.js';

export const AI_CONTEXT_TOOL_DEFINITIONS = [
  {
    name: 'get_ai_context',
    description: 'Get intent-aware code context with token budgeting. Returns source, callers, callees, tests based on intent (explain/modify/debug/test).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to get context for (supports Class.method, file:symbol formats)' },
        intent: { type: 'string', description: 'Intent: explain, modify, debug, test (default: explain)', enum: ['explain', 'modify', 'debug', 'test'] },
        token_budget: { type: 'number', description: 'Max tokens for response (default: 4000, min: 500)' },
        caller_depth: { type: 'number', description: 'Depth for caller/callee traversal (default: 1, max: 5)' }
      },
      required: ['symbol']
    }
  },
  {
    name: 'get_edit_context',
    description: 'Get everything needed before editing a symbol: source + callers + tests + git history + siblings. Optimized for code modification.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name or file:line format' },
        include_callers: { type: 'boolean', description: 'Include caller context (default: true)' },
        include_tests: { type: 'boolean', description: 'Include related test context (default: true)' },
        include_git: { type: 'boolean', description: 'Include git history (default: true)' },
        token_budget: { type: 'number', description: 'Max tokens (default: 4000)' },
        caller_depth: { type: 'number', description: 'Caller traversal depth (default: 1)' }
      },
      required: ['symbol']
    }
  },
  {
    name: 'get_curated_context',
    description: 'Natural language query across codebase: searches code symbols, knowledge base, and graph relationships. Returns ranked results within token budget.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query (e.g., "how does authentication work")' },
        max_tokens: { type: 'number', description: 'Max tokens for response (default: 4000)' },
        include_source: { type: 'boolean', description: 'Search code symbols (default: true)' },
        include_memory: { type: 'boolean', description: 'Search knowledge base (default: true)' },
        include_graph: { type: 'boolean', description: 'Expand via graph relationships (default: true)' },
        source_weights: {
          type: 'object',
          description: 'Custom weights for source ranking',
          properties: {
            code: { type: 'number' },
            memory: { type: 'number' },
            graph: { type: 'number' }
          }
        }
      },
      required: ['query']
    }
  }
];

/** Handle get_ai_context tool call. */
export function handleGetAIContext(args: Record<string, unknown>, adapter: DatabaseAdapter, workspace: string, projectId?: string): string {
  const resolver = new SymbolResolver(adapter, projectId);
  const graphRepo = new GraphRepository(adapter, projectId);
  const callGraph = new CallGraphService(graphRepo, resolver);
  const service = new AIContextService(adapter, resolver, callGraph, workspace);

  const params = {
    symbol: args.symbol as string,
    intent: (args.intent as string) || 'explain',
    token_budget: (args.token_budget as number) || 4000,
    caller_depth: (args.caller_depth as number) || 1
  };

  const result = executeSync(() => service.getContext(params));
  return JSON.stringify(result, null, 2);
}

/** Handle get_edit_context tool call. */
export function handleGetEditContext(args: Record<string, unknown>, adapter: DatabaseAdapter, workspace: string, projectId?: string): string {
  const resolver = new SymbolResolver(adapter, projectId);
  const graphRepo = new GraphRepository(adapter, projectId);
  const callGraph = new CallGraphService(graphRepo, resolver);
  const testDetector = new TestDetector(adapter, projectId);
  const service = new EditContextService(adapter, resolver, callGraph, testDetector, workspace);

  const params = {
    symbol: args.symbol as string,
    include_callers: (args.include_callers as boolean) ?? true,
    include_tests: (args.include_tests as boolean) ?? true,
    include_memories: false,
    include_git: (args.include_git as boolean) ?? true,
    token_budget: (args.token_budget as number) || 4000,
    caller_depth: (args.caller_depth as number) || 1
  };

  const result = executeSync(() => service.getContext(params));
  return JSON.stringify(result, null, 2);
}

/** Handle get_curated_context tool call. */
export function handleGetCuratedContext(
  args: Record<string, unknown>,
  adapter: DatabaseAdapter,
  workspace: string,
  dbManager: DatabaseManager,
  projectId?: string
): string {
  const resolver = new SymbolResolver(adapter, projectId);
  const traverser = new GraphTraverser(adapter, resolver, workspace, projectId);
  const queryLayer = new QueryLayer(dbManager);
  const service = new CuratedContextService(adapter, queryLayer, traverser, resolver);

  const params = {
    query: args.query as string,
    max_tokens: (args.max_tokens as number) || 4000,
    include_source: (args.include_source as boolean) ?? true,
    include_memory: (args.include_memory as boolean) ?? true,
    include_graph: (args.include_graph as boolean) ?? true,
    source_weights: args.source_weights as any,
    projectId
  };

  const result = executeSync(() => service.getContext(params));
  return JSON.stringify(result, null, 2);
}

/**
 * Execute an async function synchronously.
 * Works because better-sqlite3 is synchronous — the async wrappers
 * resolve immediately without actual I/O waiting.
 */
function executeSync<T>(fn: () => Promise<T>): T {
  let result: T | undefined;
  let error: Error | undefined;
  fn().then(r => { result = r; }).catch(e => { error = e; });
  if (error) throw error;
  return result as T;
}
