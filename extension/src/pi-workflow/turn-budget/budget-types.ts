/**
 * Shared types + tuning constants for the turn loop guard.
 * Extracted verbatim from turn-budget-guard.ts (BR-18 file-size split).
 */
export interface TurnBudget {
  timeoutMs?: number;
  /** Steer (then abort on persistence) when one identical tool+args call repeats this many times. */
  maxSameToolRepeats?: number;
}

export const DEFAULT_MAX_SAME_TOOL_REPEATS = 4;
/**
 * Wall-clock timeout default: 0 = DISABLED (product decision — a turn must only
 * stop on REPETITION, never on elapsed time; a legit long task keeps running as
 * long as it keeps making new progress). Set a positive `timeoutMs` (e.g. via
 * `sdlcAgents.backend.chatTimeout`) to opt back into a wall-clock backstop.
 */
export const DEFAULT_TURN_TIMEOUT_MS = 0;
export const MIN_SAME_TOOL_REPEATS = 2;
export const MAX_SAME_TOOL_REPEATS_CAP = 20;
/** Assistant text blocks shorter than this never count (greetings, "OK"...). */
export const MIN_REPEAT_BLOCK_CHARS = 30;
/** Skip text scanning past this size (long outputs: tool guard still applies). */
export const MAX_TEXT_SCAN_CHARS = 100_000;

export type StopReason = 'repeat' | 'timeout';
export type ObserveAction = 'ok' | 'steer' | 'abort';
/** Kind of the most recent steer/abort trip (SA4E-368). */
export type TripKind = 'identical' | 'reread';
