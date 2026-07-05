/**
 * Spinner types and constants — KSA-255
 */

/** Spinner processing states */
export type SpinnerState = 'READY' | 'PROCESSING';

/** Triggers that cause state transitions */
export type SpinnerTrigger = 'START' | 'STOP';

/** Reason for stopping */
export type StopReason = 'complete' | 'cancelled' | 'error' | 'timeout';

/** State transition definition */
export interface SpinnerTransition {
  from: SpinnerState;
  to: SpinnerState;
  trigger: SpinnerTrigger;
}

/** Configuration constants */
export const SPINNER_CONFIG = {
  TIMEOUT_MS: 60_000,
  MAX_SHOW_DELAY_MS: 100,
  MAX_STOP_DELAY_MS: 50,
  ANIMATION_DURATION_MS: 1000,
  SPINNER_SIZE_PX: 14,
  TEXT_SIZE_PX: 11,
} as const;

/** State transitions table */
export const SPINNER_TRANSITIONS: SpinnerTransition[] = [
  { from: 'READY', to: 'PROCESSING', trigger: 'START' },
  { from: 'PROCESSING', to: 'READY', trigger: 'STOP' },
];
