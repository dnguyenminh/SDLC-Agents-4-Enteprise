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
