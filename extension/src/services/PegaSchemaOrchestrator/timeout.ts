/**
 * Total-timeout guard for schema orchestration (TDD §10.1: 60s budget).
 */

/** Throw if total timeout exceeded. */
export function checkTotalTimeout(startTime: number, totalTimeoutMs: number, ruleType: string): void {
  if (Date.now() - startTime > totalTimeoutMs) {
    throw new Error(`Total timeout exceeded for ${ruleType} (${totalTimeoutMs}ms)`);
  }
}
