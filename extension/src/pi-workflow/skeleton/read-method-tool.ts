/**
 * SA4E-360 — read_method core tool (TDD §4.5, C-360-R1/R2; FSD §6.2 pseudocode).
 *
 * Symbol-level agentic reading: exact (class, method) locate via the loopback
 * index → index-data bounds check BEFORE any read (EF-4) → path-contained
 * line-range slice → JSON envelope. Every domain condition is conveyed INSIDE
 * the envelope (the turn NEVER crashes — TDD §6.5); loops stay bounded by the
 * shipped TurnBudgetGuard (BR-11 — no new loop protection here).
 *
 * SEC-360-06: MAX_SLICE_LINES / MAX_SLICE_BYTES hard cap — an oversized symbol
 * returns an `ok` envelope with sliceTruncated:true, never a full-file read.
 * The resolution pipeline lives in ./read-method-resolver (BR-18).
 */
import { Type } from 'typebox';
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { logger } from '../../logger.js';
import type { SymbolLocator } from './symbol-locator.js';
import type { IndexFreshnessChecker } from './index-freshness-checker.js';
import { runResolve, type ReadMethodEnvelope } from './read-method-resolver';

// Caps + envelope type moved to read-method-resolver.ts (BR-18) — re-exported
// so the public symbols stay at this path.
export { MAX_SLICE_LINES, MAX_SLICE_BYTES } from './read-method-resolver';
export type { ReadMethodEnvelope } from './read-method-resolver';

export const READ_METHOD_TOOL_NAME = 'read_method';

export interface ReadMethodDeps {
  /** Telemetry sink for PI_READ_METHOD_RESULT (counts only — no code bodies). */
  emit?: (event: string, payload: { status: string; durationMs: number; sliceLines: number }) => void;
  /** Injected line reader for tests (default contained fs read). */
  readSlice?: (absolutePath: string, startLine: number, endLine: number) => string[] | null;
}

/**
 * Creates the read_method AgentTool (legacy AgentTool shape — mirrors
 * createWorkspaceInfoTool; session shape applied via toSessionToolDefinition).
 */
export function createReadMethodTool(
  workspaceRoot: string,
  locator: SymbolLocator,
  freshness: IndexFreshnessChecker,
  deps: ReadMethodDeps = {}
): AgentTool {
  return {
    name: READ_METHOD_TOOL_NAME,
    label: 'Read method',
    description:
      'Read one method/function body by (enclosing class, method name) from the code index — ' +
      'preferred over whole-file read for symbol-targeted inspection. Returns exact slice bounds.',
    parameters: Type.Object({
      class: Type.String({ minLength: 1, description: 'Enclosing class/interface name as indexed in symbols' }),
      method: Type.String({ minLength: 1, description: 'Method/function name as indexed in symbols' }),
    }),
    execute: async (
      _toolCallId: string,
      params: unknown
    ): Promise<AgentToolResult<unknown>> => {
      const started = Date.now();
      const envelope = await runResolve(workspaceRoot, locator, freshness, params);
      const sliceLines = envelope.status === 'ok'
        ? envelope.sourceSlice.split('\n').length
        : 0;
      emitResult(deps.emit, envelope.status, started, sliceLines);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(envelope) }],
        details: envelope,
      } as unknown as AgentToolResult<unknown>;
    },
  } as unknown as AgentTool;
}

function emitResult(
  emit: ReadMethodDeps['emit'],
  status: string,
  started: number,
  sliceLines: number
): void {
  const payload = { status, durationMs: Date.now() - started, sliceLines };
  try {
    logger.info('PI_READ_METHOD_RESULT', payload);
    emit?.('PI_READ_METHOD_RESULT', payload);
  } catch { /* telemetry never blocks the tool (BR-360-03) */ }
}
