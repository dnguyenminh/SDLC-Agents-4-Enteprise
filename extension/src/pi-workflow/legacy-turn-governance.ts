/**
 * Legacy turn governance — SA4E-355 UAT fix.
 *
 * Wires the Context Budget Governance (budget gate + history compaction) into
 * the legacy PiWorkflowEngine chat path. Before the turn reaches the provider,
 * the FULL request is estimated (system + accumulated history + user prompt +
 * tool schemas — the UAT 73k-token composition). Over-budget turns compact the
 * conversation history (trim-oldest first, then compress survivors); a turn
 * that still cannot fit throws PI_CONTEXT_BUDGET_EXCEEDED so the provider is
 * never called with an oversized request (BR-09).
 */
import { logger } from '../logger';
import { resolveContextBudget } from '../pi-agent/context-budget-resolver.js';
import { usableTokensOf } from '../pi-agent/models/ContextBudget.js';
import { estimateTokenCount, compressPrompt } from '../pi-agent/prompt-compressor.js';
import { estimateToolSchemaTokens, type LoadoutTool } from '../pi-agent/tool-schema-tokens.js';
import { BudgetCalculator, DEFAULT_SYSTEM_PROMPT_CHARS } from '../mcp/context-budget';
import { PiContextBudgetExceededError } from '../pi-agent/budget-gate.js';

/** A chat message as stored in PipelineState.chatHistory. */
export interface TurnMessage {
  role: string;
  content: string;
}

/** Input contract for {@link governLegacyTurn}. */
export interface LegacyTurnGovernanceInput {
  /** Workspace system prompt handed to the executor (same string as the turn). */
  systemPrompt: string;
  /** Accumulated conversation history (the UAT 73k-token culprit). */
  history: ReadonlyArray<TurnMessage>;
  /** New user prompt for this turn. */
  chatInput: string;
  /** Tool definitions sent with the request (builtin + extension). */
  tools: ReadonlyArray<unknown>;
  /** Configured model id (e.g. 'qwen') — registry fallback of the window chain (BR-01). */
  modelId: string;
  /** Provider-detected window (meta.n_ctx) — WINS over the registry (BR-01). */
  nCtxDetected?: number;
}

/** Token measurement of one assembled legacy request. */
export interface LegacyTurnMeasurement {
  systemTokens: number;
  historyTokens: number;
  promptTokens: number;
  toolSchemaTokens: number;
  totalTokens: number;
}

/** Governance outcome handed back to the adapter. */
export interface LegacyGovernanceResult {
  /** History AFTER compaction — the adapter passes it to engine.executeTurn. */
  history: TurnMessage[];
  /** Total estimated request tokens after governance. */
  totalTokens: number;
  /** True when the history was compacted (trimmed/compressed). */
  compacted: boolean;
}

/**
 * Measures the FULL legacy request in tokens (chars/4): workspace system
 * prompt + SDK base prompt (parity with the session gate accounting) +
 * accumulated history (content only) + user prompt + tool schemas.
 */
export function measureLegacyTurnTokens(input: LegacyTurnGovernanceInput): LegacyTurnMeasurement {
  const systemTokens =
    estimateTokenCount(input.systemPrompt) + BudgetCalculator.estimateTokens(DEFAULT_SYSTEM_PROMPT_CHARS);
  const historyTokens = input.history.reduce<number>((sum, m) => sum + estimateTokenCount(String(m?.content ?? '')), 0);
  const promptTokens = estimateTokenCount(input.chatInput);
  const toolSchemaTokens = input.tools.reduce<number>((sum, t) => sum + estimateToolSchemaTokens(asLoadoutTool(t)), 0);
  return {
    systemTokens,
    historyTokens,
    promptTokens,
    toolSchemaTokens,
    totalTokens: systemTokens + historyTokens + promptTokens + toolSchemaTokens,
  };
}

/**
 * Compacts history to fit `budgetTokens`: walks newest→oldest keeping every
 * message that fits raw; a message that only fits compressed is compressed
 * (UC-03 mechanism); everything older is dropped. Never mutates the input.
 * Returns at least an empty array — the caller re-measures the full request.
 */
export function compactHistoryToFit(
  history: ReadonlyArray<TurnMessage>,
  budgetTokens: number
): TurnMessage[] {
  const kept: TurnMessage[] = [];
  let total = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const raw = { role: String(history[i]?.role ?? 'user'), content: String(history[i]?.content ?? '') };
    const rawTokens = estimateTokenCount(raw.content);
    if (total + rawTokens <= budgetTokens) {
      kept.unshift(raw);
      total += rawTokens;
      continue;
    }
    const compressed = { ...raw, content: compressPrompt(raw.content) };
    const compressedTokens = estimateTokenCount(compressed.content);
    if (total + compressedTokens <= budgetTokens) {
      kept.unshift(compressed);
      total += compressedTokens;
      continue;
    }
    break; // this message (and everything older) cannot fit
  }
  return kept;
}

/**
 * Governs one legacy turn: resolve the budget (BR-01 chain provider →
 * registry → default), measure the full request, compact history when over
 * the usable budget, REJECT when it still cannot fit (BR-09).
 *
 * @throws PiContextBudgetExceededError when even a fully-compacted request
 * exceeds the usable budget — the caller must surface PI_CONTEXT_BUDGET_EXCEEDED
 * and never invoke the provider.
 */
export function governLegacyTurn(input: LegacyTurnGovernanceInput): LegacyGovernanceResult {
  const budget = resolveContextBudget({ modelId: input.modelId, nCtxDetected: input.nCtxDetected });
  const usable = usableTokensOf(budget);
  let measured = measureLegacyTurnTokens(input);
  let history: TurnMessage[] = [...input.history];
  let compacted = false;

  if (measured.totalTokens > usable) {
    const fixedTokens = measured.totalTokens - measured.historyTokens;
    history = compactHistoryToFit(history, Math.max(0, usable - fixedTokens));
    compacted = true;
    measured = measureLegacyTurnTokens({ ...input, history });
    logger.info('PI_LEGACY_HISTORY_COMPACTED', {
      modelId: input.modelId,
      nCtx: budget.nCtx,
      usable,
      historyMessages: history.length,
      totalTokens: measured.totalTokens,
    });
    if (measured.totalTokens > usable) {
      logger.error('PI_CONTEXT_BUDGET_EXCEEDED', {
        totalTokens: measured.totalTokens,
        usable,
        nCtx: budget.nCtx,
      });
      throw new PiContextBudgetExceededError(measured.totalTokens, usable, budget.nCtx, 'request');
    }
  }
  return { history, totalTokens: measured.totalTokens, compacted };
}

/** Adapts an arbitrary tool definition (schema | inputSchema | parameters) to the OI-4 estimator. */
function asLoadoutTool(tool: unknown): LoadoutTool {
  const t = (tool ?? {}) as {
    name?: unknown;
    description?: unknown;
    schema?: unknown;
    inputSchema?: unknown;
    parameters?: unknown;
  };
  return {
    name: typeof t.name === 'string' ? t.name : '',
    description: typeof t.description === 'string' ? t.description : undefined,
    schema: t.schema ?? t.inputSchema ?? t.parameters ?? {},
  };
}
