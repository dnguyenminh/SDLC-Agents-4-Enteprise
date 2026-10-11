import { logger } from '../logger';
import { MIN_RESERVE_TOKENS } from '../mcp/context-budget';
import { DEFAULT_MODEL_REGISTRY } from './model-registry';
import { ContextBudget } from './models/ContextBudget';

/**
 * Terminal fallback context window when provider detection AND the model
 * registry both fail to produce a usable window (BR-01 — never 0/unbounded).
 */
export const DEFAULT_CONTEXT_WINDOW = 8192;

/** Fraction of nCtx reserved as safety margin (BR-02). */
export const SAFETY_MARGIN_RATIO = 0.08;

/** Fraction of usable tokens allocated to static context (BR-03). */
export const STATIC_BUDGET_RATIO = 0.70;

/** Minimal positive usable-token floor for degenerate tiny models (UC-01 EF-2). */
export const MIN_USABLE_TOKENS = 1;

/** Origin of the resolved nCtx — provider meta.n_ctx, registry entry, or default. */
export type ContextBudgetSource = 'provider' | 'registry' | 'default';

/** Input contract for {@link resolveContextBudget} (FSD §3.1.6 / TDD §5.2). */
export interface ResolveContextBudgetInput {
  /** Selected model identifier, e.g. 'qwen' (BR-14). */
  modelId: string;
  /** Provider-detected context window (meta.n_ctx) when available (BR-01). */
  nCtxDetected?: number;
  /** Model tier from UC-06; reserved for budget-mode selection — default 70/30 split applies (OI-3). */
  tier?: 'small' | 'medium' | 'large' | null;
  /** Explicit output-reserve override; default registry maxOutput, floored at 2000 (OI-2). */
  reserveOutput?: number;
}

/**
 * Resolves the authoritative session {@link ContextBudget} (UC-01).
 *
 * Fallback chain (BR-01): provider-detected n_ctx → ModelRegistry entry →
 * default 8192. Never returns 0/unbounded and never throws for missing data;
 * invalid values anywhere in the chain are skipped in favor of the next source.
 */
export function resolveContextBudget(input: ResolveContextBudgetInput): ContextBudget {
  const entry = DEFAULT_MODEL_REGISTRY.get(input.modelId);
  const { nCtx, source } = resolveNCtx(input.nCtxDetected, entry?.contextWindow, input.modelId);
  const reserveOutput = resolveReserveOutput(input.reserveOutput, entry?.maxOutput);
  const safetyMargin = Math.ceil(nCtx * SAFETY_MARGIN_RATIO);
  const usable = Math.max(nCtx - reserveOutput - safetyMargin, MIN_USABLE_TOKENS);
  const staticBudget = Math.floor(usable * STATIC_BUDGET_RATIO);
  const budget: ContextBudget = {
    nCtx,
    reserveOutput,
    safetyMargin,
    staticBudget,
    historyBudget: usable - staticBudget,
  };
  logger.info('Context budget resolved', { modelId: input.modelId, source, ...budget });
  return budget;
}

/** Picks the first valid context window: provider → registry → default (BR-01). */
function resolveNCtx(
  detected: number | undefined,
  registryWindow: number | undefined,
  modelId: string
): { nCtx: number; source: ContextBudgetSource } {
  if (isValidContextWindow(detected)) {
    return { nCtx: Math.floor(detected), source: 'provider' };
  }
  logger.warn('PI_CONTEXT_DETECT_FALLBACK', { modelId, detected });
  if (isValidContextWindow(registryWindow)) {
    return { nCtx: Math.floor(registryWindow), source: 'registry' };
  }
  logger.warn('PI_CONTEXT_DETECT_DEFAULT', { modelId });
  return { nCtx: DEFAULT_CONTEXT_WINDOW, source: 'default' };
}

/** Resolves the output reserve: explicit override → registry maxOutput → floor 2000 (OI-2). */
function resolveReserveOutput(
  explicit: number | undefined,
  registryMaxOutput: number | undefined
): number {
  if (isValidPositive(explicit)) {
    return Math.max(explicit, MIN_RESERVE_TOKENS);
  }
  const fromRegistry = isValidPositive(registryMaxOutput) ? registryMaxOutput : MIN_RESERVE_TOKENS;
  return Math.max(fromRegistry, MIN_RESERVE_TOKENS);
}

/** A context window is valid when it is finite and flooring keeps it a positive integer (EF-1). */
function isValidContextWindow(value: number | undefined): value is number {
  return isValidPositive(value) && Math.floor(value) > 0;
}

/** Finite positive number guard — NaN, ±Infinity, 0 and negatives are rejected. */
function isValidPositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
