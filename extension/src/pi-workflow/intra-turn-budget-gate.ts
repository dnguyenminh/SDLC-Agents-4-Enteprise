/**
 * Intra-turn budget gate — SA4E-355 UAT bug 2.
 *
 * `governLegacyTurn` gates the turn ONCE at turn start, but the pi-ai Agent
 * loop makes MANY intra-turn LLM requests: every iteration appends tool
 * results to the transcript before the next request (UAT: 4,245 → 76,349
 * tokens → raw 400 against n_ctx 65536). The ONLY interception point that
 * sees every intra-turn request is the Agent's `streamFn` — it receives the
 * full normalized transcript (`TranscriptContext.messages`) right before the
 * provider call.
 *
 * This module gates that call: measure (REUSING `measureLegacyTurnTokens`
 * accounting), compact the transcript when over the usable budget (see
 * `transcript-compaction.ts` for the wire-safe mechanics), and REJECT with
 * `PiContextBudgetExceededError` when even the compacted request cannot fit
 * (BR-09) — the provider never sees an oversized request. The input
 * transcript is NEVER mutated; a new array is returned.
 */
import type { Message } from '@earendil-works/pi-ai';
import { getCurrentSystemPrompt, getCurrentTools } from '@earendil-works/pi-ai';
import { logger } from '../logger';
import { resolveContextBudget } from '../pi-agent/context-budget-resolver.js';
import { usableTokensOf } from '../pi-agent/models/ContextBudget.js';
import { estimateToolSchemaTokens, type LoadoutTool } from '../pi-agent/tool-schema-tokens.js';
import { measureLegacyTurnTokens, type LegacyTurnMeasurement, type TurnMessage } from './legacy-turn-governance.js';
import { compactTranscriptToFit, flattenContent } from './transcript-compaction.js';
import { PiContextBudgetExceededError } from '../pi-agent/budget-gate.js';

/** Input contract for the intra-turn gate (one Agent-loop LLM request). */
export interface IntraTurnGateInput {
  /** Full normalized transcript about to be sent (TranscriptContext.messages). */
  messages: ReadonlyArray<Message>;
  /** Active model id (e.g. 'qwen-text') — registry fallback of the BR-01 chain. */
  modelId: string;
  /** Probe/runtime-detected window (meta.n_ctx) — WINS over the registry (BR-01). */
  nCtxDetected?: number;
}

/** Gate outcome handed to the provider boundary. */
export interface IntraTurnGateResult {
  /** NEW messages array (provider-safe) — the input transcript is never mutated. */
  messages: Message[];
  /** Total estimated request tokens after the gate. */
  totalTokens: number;
  /** True when the transcript was compacted (trimmed/compressed). */
  compacted: boolean;
}

/** Adapts a pi-ai tool declaration to the OI-4 schema estimator. */
function asLoadoutTool(tool: { name?: string; description?: string; parameters?: unknown }): LoadoutTool {
  return { name: tool?.name ?? '', description: tool?.description, schema: tool?.parameters ?? {} };
}

/** The non-system transcript messages, flattened to the legacy measure shape. */
function toHistory(messages: ReadonlyArray<Message>): TurnMessage[] {
  const history: TurnMessage[] = [];
  for (const msg of messages) {
    const m = msg as { role?: string; content?: unknown };
    if (m.role === 'system') continue; // system replayed separately (prompt + tools)
    history.push({ role: String(m.role ?? 'user'), content: flattenContent(m.content) });
  }
  return history;
}

/**
 * Measures the FULL intra-turn request by REUSING the legacy measure
 * (`measureLegacyTurnTokens`): the replayed system prompt (parity constant
 * included), tool declarations replayed from system messages (OI-4), and
 * every non-system message flattened (chars/4).
 */
export function measureIntraTurnRequest(input: IntraTurnGateInput): LegacyTurnMeasurement {
  const messages: Message[] = [...input.messages];
  return measureLegacyTurnTokens({
    systemPrompt: getCurrentSystemPrompt(messages) ?? '',
    history: toHistory(messages),
    chatInput: '', // trailing user prompt is already inside history — same total
    tools: getCurrentTools(messages).map(asLoadoutTool),
    modelId: input.modelId,
    nCtxDetected: input.nCtxDetected,
  });
}

/**
 * Gates ONE intra-turn LLM request: resolve the budget (BR-01 chain), measure
 * the full request, compact the transcript when over the usable budget, and
 * REJECT when it still cannot fit (BR-09).
 *
 * @throws PiContextBudgetExceededError when even a fully-compacted request
 * exceeds the usable budget — the Agent loop turns the throw into a failed
 * assistant message (stopReason 'error'), surfacing the actionable message
 * instead of the provider's raw 400.
 */
export function governIntraTurnRequest(input: IntraTurnGateInput): IntraTurnGateResult {
  const budget = resolveContextBudget({ modelId: input.modelId, nCtxDetected: input.nCtxDetected });
  const usable = usableTokensOf(budget);
  const measured = measureIntraTurnRequest(input);
  if (measured.totalTokens <= usable) {
    return { messages: [...input.messages], totalTokens: measured.totalTokens, compacted: false };
  }
  const fixed = measured.systemTokens + measured.toolSchemaTokens;
  const historyBudget = Math.max(0, usable - fixed);
  const compacted = compactTranscriptToFit(input.messages, historyBudget);
  const remeasured = measureIntraTurnRequest({ ...input, messages: compacted.messages });
  logCompaction(input.modelId, budget.nCtx, usable, compacted.messages.length, remeasured.totalTokens);
  rejectIfUnfitting(input, compacted.messages, remeasured.totalTokens, measured.totalTokens, usable, budget.nCtx);
  return { messages: compacted.messages, totalTokens: remeasured.totalTokens, compacted: true };
}

/** Compaction observability — same event + shape as the turn-start gate. */
function logCompaction(modelId: string, nCtx: number, usable: number, historyMessages: number, totalTokens: number): void {
  logger.info('PI_LEGACY_HISTORY_COMPACTED', { modelId, nCtx, usable, historyMessages, totalTokens });
}

/**
 * BR-09: REJECT when compaction cannot produce a respondable fitting request.
 * Reports the post-compaction total when it still overflows, or the ORIGINAL
 * request total when the newest unit had to be dropped (system-only kept —
 * the meaningful rejected size is what could not be made to fit).
 */
function rejectIfUnfitting(
  input: IntraTurnGateInput,
  kept: ReadonlyArray<Message>,
  compactedTotal: number,
  originalTotal: number,
  usable: number,
  nCtx: number
): void {
  const messages = [...input.messages];
  const hadRespondable = messages.some((m) => (m as { role?: string }).role !== 'system');
  const keptRespondable = [...kept].some((m) => (m as { role?: string }).role !== 'system');
  const newestDropped = hadRespondable && !keptRespondable;
  const totalTokens = newestDropped ? originalTotal : compactedTotal;
  if (!(totalTokens > usable || newestDropped)) return;
  logger.error('PI_CONTEXT_BUDGET_EXCEEDED', { totalTokens, usable, nCtx });
  throw new PiContextBudgetExceededError(totalTokens, usable, nCtx, 'request');
}
