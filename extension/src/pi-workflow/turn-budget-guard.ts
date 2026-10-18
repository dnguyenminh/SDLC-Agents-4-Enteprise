/**
 * TurnBudgetGuard — public facade (BR-18 file-size split).
 *
 * Implementation lives in sibling submodules under `turn-budget/`:
 * - budget-types.ts     — TurnBudget type + tuning constants + result types
 * - read-target.ts      — SA4E-368 read-target extraction for read/ls tools
 * - TurnBudgetGuard.ts  — the repetition-based loop guard itself
 * - steer-corrections.ts— stop notes + mid-loop agent.steer() corrections
 * - completed-blocks.ts — fence-aware completed-block splitter
 *
 * Re-exports the SAME public symbols at the SAME import path — no caller changes.
 */
export type {
  TurnBudget,
  StopReason,
  ObserveAction,
  TripKind,
} from './turn-budget/budget-types.js';
export {
  DEFAULT_MAX_SAME_TOOL_REPEATS,
  DEFAULT_TURN_TIMEOUT_MS,
  MIN_SAME_TOOL_REPEATS,
  MAX_SAME_TOOL_REPEATS_CAP,
  MIN_REPEAT_BLOCK_CHARS,
} from './turn-budget/budget-types.js';
export { readTargetOfArgs, extractReadTarget } from './turn-budget/read-target.js';
export { TurnBudgetGuard } from './turn-budget/TurnBudgetGuard.js';
export {
  buildStopNote,
  buildTextSteerCorrection,
  buildRereadSteerCorrection,
  buildSteerCorrection,
  buildFailureSteerCorrection,
} from './turn-budget/steer-corrections.js';
export { splitCompletedBlocks } from './turn-budget/completed-blocks.js';
