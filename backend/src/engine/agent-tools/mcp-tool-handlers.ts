/**
 * SA4E-420 — MCP handlers for the 4 core agent tools. Each call resolves the
 * session pin through the shared pinned-snapshot guard (no branch-head
 * fallback), validates args with zod, then delegates to CoreAgentTools.
 */

import { z } from 'zod';
import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { ToolHandler, ToolResult as McpToolResult } from '../../types/tool.js';
import { PinValidationError, resolvePinnedContext } from '../api/pinned-snapshot-guard.js';
import type { SnapshotRetrievalService } from '../retrieval/snapshot-retrieval.js';
import type { CoreAgentTools } from './core-tools.js';
import type { SessionPin, ToolResult } from './tool-context.js';
import type { CoreAgentToolName } from './mcp-tool-definitions.js';

const PinArgs = z.object({ session_id: z.string().min(1), index_snapshot_id: z.string().min(1) });

const SearchArgs = PinArgs.extend({
  query: z.string().min(1),
  limit: z.number().optional(),
  offset: z.number().min(0).optional(),
  kind: z.string().optional(),
  path_filter: z.string().optional(),
});
const SkeletonArgs = PinArgs.extend({ file_path: z.string().min(1) });
const BlockArgs = PinArgs.extend({
  file_path: z.string().min(1),
  start_line: z.number(),
  end_line: z.number(),
});
const GraphArgs = PinArgs.extend({
  symbol_id: z.string().min(1),
  direction: z.enum(['CALLERS', 'CALLEES', 'IMPLEMENTATIONS']).default('CALLEES'),
});

type Runner = (tools: CoreAgentTools, pin: SessionPin, raw: Record<string, unknown>) => Promise<ToolResult<unknown>>;

/** Strategy map: tool name -> arg parsing + delegate call (OCP: add one entry per tool). */
const RUNNERS: Record<CoreAgentToolName, Runner> = {
  search_symbols: (t, pin, raw) => {
    const { query, offset, limit, kind, path_filter } = SearchArgs.parse(raw);
    return t.searchSymbols(pin, { query, limit, kind, path_filter }, offset ?? 0);
  },
  get_file_skeleton: (t, pin, raw) => t.getFileSkeleton(pin, SkeletonArgs.parse(raw).file_path),
  read_code_block: (t, pin, raw) => {
    const a = BlockArgs.parse(raw);
    return t.readCodeBlock(pin, a.file_path, a.start_line, a.end_line);
  },
  query_call_graph: (t, pin, raw) => {
    const a = GraphArgs.parse(raw);
    return t.queryCallGraph(pin, a.symbol_id, a.direction);
  },
};

/** Compact text for the model: DSL body + one metadata footer line. */
export function formatToolResult(r: ToolResult<unknown>): McpToolResult {
  const footer = `[RESULT_ID: ${r.resultId} | TRUNCATED: ${r.truncated}${r.nextPageCursor ? ` | NEXT: ${r.nextPageCursor}` : ''} | TOKENS: ${r.budgetUsedTokens}]`;
  return { content: [{ type: 'text', text: `${r.dsl}\n${footer}` }], isError: false };
}

async function resolvePin(
  db: QueryDatabaseAdapter,
  retrieval: SnapshotRetrievalService,
  raw: Record<string, unknown>,
): Promise<SessionPin> {
  try {
    const ctx = await resolvePinnedContext(db, retrieval, raw);
    return { repository_id: ctx.repositoryId, commit_id: ctx.commitId, index_snapshot_id: ctx.indexSnapshotId };
  } catch (err) {
    // Surface the machine-readable code so the model/user can act on it.
    if (err instanceof PinValidationError) throw new Error(`${err.code}: ${err.message}`);
    throw err;
  }
}

/** Build one MCP handler per core tool. Errors propagate to withErrorHandling. */
export function createCoreAgentToolHandlers(
  db: QueryDatabaseAdapter,
  retrieval: SnapshotRetrievalService,
  tools: CoreAgentTools,
): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  for (const [name, run] of Object.entries(RUNNERS)) {
    handlers.set(name, async (raw) => {
      const pin = await resolvePin(db, retrieval, raw);
      return formatToolResult(await run(tools, pin, raw));
    });
  }
  return handlers;
}
