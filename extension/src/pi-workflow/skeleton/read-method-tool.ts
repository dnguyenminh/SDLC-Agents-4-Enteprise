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
 */
import * as fs from 'node:fs';
import { createInterface } from 'node:readline';
import { Type } from 'typebox';
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { debugLog } from '../../debug-logger';
import { logger } from '../../logger.js';
import { resolveContainedPath } from '../../pi-agent/context-retrieval/path-containment.js';
import type { SymbolLocator } from './symbol-locator.js';
import type { IndexFreshnessChecker } from './index-freshness-checker.js';
import type { LocateRow } from './skeleton-types.js';

export const READ_METHOD_TOOL_NAME = 'read_method';

/** SEC-360-06 remediation: hard slice caps (never a whole-file read). */
export const MAX_SLICE_LINES = 2_000;
export const MAX_SLICE_BYTES = 256 * 1024;

export type ReadMethodEnvelope =
  | { status: 'ok'; filePath: string; symbolKind: string; name: string; signature?: string;
      startLine: number; endLine: number; sourceSlice: string; sliceTruncated?: boolean; totalLines?: number }
  | { status: 'ambiguous'; candidates: Array<{ name: string; kind: string; filePath: string; startLine: number }> }
  | { status: 'not_found'; suggestions: string[]; classMethods?: string[] }
  | { status: 'error'; code: 'INVALID_ARGS' | 'FILE_UNREADABLE' | 'INDEX_UNAVAILABLE'; message: string; usageHint?: string };

const SUGGESTIONS = ['get_workspace_info', 'find_tools', 'code_search'];
const USAGE_HINT = "Usage: read_method({ class: 'EnclosingType', method: 'methodName' }) — both non-empty strings.";

export interface ReadMethodDeps {
  /** Telemetry sink for PI_READ_METHOD_RESULT (counts only — no code bodies). */
  emit?: (event: string, payload: { status: string; durationMs: number; sliceLines: number }) => void;
  /** Injected line reader for tests (default contained fs read). */
  readSlice?: (absolutePath: string, startLine: number, endLine: number) => string[] | null;
}

/** Validates the trimmed non-empty string rule (FSD §3.2.4, UT-17). */
function isNonEmptyTrimmed(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Index-data bounds check BEFORE any file read (EF-4, UT-21). */
function hasCorruptBounds(row: LocateRow): boolean {
  return row.endLine < row.startLine || row.endLine > row.lineCount;
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

/** Full resolution pipeline (FSD §6.2 steps 1-5) — never throws for domain conditions. */
async function runResolve(
  workspaceRoot: string,
  locator: SymbolLocator,
  freshness: IndexFreshnessChecker,
  params: unknown
): Promise<ReadMethodEnvelope> {
  const args = (params ?? {}) as { class?: unknown; method?: unknown };
  if (!isNonEmptyTrimmed(args.class) || !isNonEmptyTrimmed(args.method)) {
    return { status: 'error', code: 'INVALID_ARGS', message: 'class and method are required non-empty strings.', usageHint: USAGE_HINT };
  }
  const cls = String(args.class).trim();
  const method = String(args.method).trim();
  let response: Awaited<ReturnType<typeof locator.locate>>;
  try {
    response = await locator.locate(cls, method);
  } catch (err) {
    logger.warn('PI_READ_METHOD_LOCATE_FAILED', { error: (err as Error).message });
    return unavailableEnvelope();
  }
  if (response.rows.length === 0) return notFound(response.classMethods);
  if (response.rows.length > 1) return ambiguous(response.rows);
  const row = response.rows[0];
  if (hasCorruptBounds(row)) return await staleRetry(workspaceRoot, locator, freshness, cls, method, row);
  return await sliceEnvelope(workspaceRoot, row);
}

/** Corrupt bounds → freshness recovery (re-index once) → ONE re-locate (AF-2/EF-4). */
async function staleRetry(
  workspaceRoot: string,
  locator: SymbolLocator,
  freshness: IndexFreshnessChecker,
  cls: string,
  method: string,
  staleRow: LocateRow
): Promise<ReadMethodEnvelope> {
  const status = await freshness.checkFile(workspaceRoot, staleRow.filePath);
  if (status === 'STALE') {
    // TA Finding B (SA4E-360 review; TDD §10-7 / FSD AF-2): re-index the
    // changed rows BEFORE the retry locate — re-locating an unchanged index
    // is a no-op self-heal. Failure is fail-safe: the single re-locate still
    // runs and degrades to the not_found steering envelope.
    try {
      await locator.reindex();
    } catch (err) {
      logger.warn('PI_READ_METHOD_REINDEX_FAILED', { error: (err as Error).message });
    }
  }
  let response: Awaited<ReturnType<typeof locator.locate>>;
  try {
    response = await locator.locate(cls, method); // retry ONCE — no nested retry (TDD §7.4)
  } catch {
    return notFound(undefined);
  }
  const row = response.rows.find((r) => !hasCorruptBounds(r));
  if (!row) return notFound(response.classMethods);
  return await sliceEnvelope(workspaceRoot, row);
}

/** Contained line-range slice → ok / FILE_UNREADABLE envelope (UT-18/22/24/25). */
async function sliceEnvelope(workspaceRoot: string, row: LocateRow): Promise<ReadMethodEnvelope> {
  const absolute = resolveContainedPath(workspaceRoot, row.filePath);
  if (!absolute) {
    return { status: 'error', code: 'FILE_UNREADABLE', message: `Path is outside the workspace root: ${row.filePath}` };
  }
  const lines = await readSliceLines(absolute, row.startLine, row.endLine);
  if (lines === null) {
    return { status: 'error', code: 'FILE_UNREADABLE', message: `Cannot read ${row.filePath} (permissions/IO).` };
  }
  const totalLines = row.endLine - row.startLine + 1;
  const truncated = lines.length < totalLines;
  const envelope: ReadMethodEnvelope = {
    status: 'ok',
    filePath: row.filePath,
    symbolKind: row.kind,
    name: row.name,
    signature: row.signature,
    startLine: row.startLine,
    endLine: row.startLine + lines.length - 1,
    sourceSlice: lines.join('\n'),
  };
  if (truncated) {
    (envelope as { sliceTruncated?: boolean; totalLines?: number }).sliceTruncated = true;
    (envelope as { sliceTruncated?: boolean; totalLines?: number }).totalLines = totalLines;
  }
  return envelope;
}

/**
 * Bounded line-range read (SEC-360-06): streams lines and STOPS at
 * MAX_SLICE_LINES / MAX_SLICE_BYTES — never pulls the whole symbol span
 * (or file) into memory. 1-based inclusive [startLine..endLine].
 */
async function readSliceLines(absolutePath: string, startLine: number, endLine: number): Promise<string[] | null> {
  const bounded = Math.min(endLine, startLine + MAX_SLICE_LINES - 1);
  const kept: string[] = [];
  let bytes = 0;
  const stream = fs.createReadStream(absolutePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    let lineNo = 0;
    for await (const line of rl) {
      lineNo++;
      if (lineNo < startLine) continue;
      if (lineNo > bounded || bytes + line.length + 1 > MAX_SLICE_BYTES) break; // cap reached — stop reading
      kept.push(line);
      bytes += line.length + 1;
    }
    return kept;
  } catch (err) {
    debugLog(`[ReadMethod] slice read failed: ${(err as Error).message}`);
    return null;
  } finally {
    rl.close();
    stream.destroy();
  }
}

function ambiguous(rows: readonly LocateRow[]): ReadMethodEnvelope {
  return {
    status: 'ambiguous',
    candidates: rows.map((r) => ({ name: r.name, kind: r.kind, filePath: r.filePath, startLine: r.startLine })),
  };
}

function notFound(classMethods: string[] | undefined): ReadMethodEnvelope {
  const envelope: ReadMethodEnvelope = { status: 'not_found', suggestions: [...SUGGESTIONS] };
  if (classMethods && classMethods.length > 0) (envelope as { classMethods?: string[] }).classMethods = classMethods;
  return envelope;
}

function unavailableEnvelope(): ReadMethodEnvelope {
  return {
    status: 'error',
    code: 'INDEX_UNAVAILABLE',
    message: 'Code index is unreachable. Call get_workspace_info for the workspace layout and steer with find_tools/code_search.',
  };
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
