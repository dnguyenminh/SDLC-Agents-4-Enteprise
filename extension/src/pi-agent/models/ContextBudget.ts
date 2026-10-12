/**
 * Context budget for a single Pi session — SA4E-355 UC-01 (FSD §3.1.4).
 *
 * Single source of truth derived from the running model's real context
 * window (n_ctx). Consumed by the session host, loader overrides, the
 * role-aware tool loadout, and the budget gate.
 */
export interface ContextBudget {
  /** Real context window of the running model — always > 0, integer (BR-01). */
  nCtx: number;
  /** Tokens reserved for model output — always >= MIN_RESERVE_TOKENS (2000). */
  reserveOutput: number;
  /** Safety buffer = ceil(nCtx × 8%) covering chars/4 under-estimation for CJK/Vietnamese (BR-02). */
  safetyMargin: number;
  /** Budget for static context (steering + AGENTS.md + tool schemas) — ~70% of usable (BR-03). */
  staticBudget: number;
  /** Budget for conversation history — exact remainder of usable, ~30% (BR-03). */
  historyBudget: number;
}

/**
 * Usable prompt tokens for a resolved budget: nCtx − reserveOutput −
 * safetyMargin (BR-02), floored at 1 (BR-01: never 0/unbounded). Single
 * source of truth for every consumer that thresholds against the window
 * (session host auto-chunk, legacy turn governance).
 */
export function usableTokensOf(budget: ContextBudget): number {
  return Math.max(1, budget.nCtx - budget.reserveOutput - budget.safetyMargin);
}
