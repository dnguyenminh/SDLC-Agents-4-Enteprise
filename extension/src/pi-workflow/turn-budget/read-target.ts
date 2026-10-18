/**
 * Read-target extraction for the loop guard (SA4E-368).
 * Extracted verbatim from turn-budget-guard.ts (BR-18 file-size split).
 */

/**
 * File-identity tools whose arguments identify ONE concrete target (a file
 * path / a directory listing). Re-reading the SAME target is the "review all
 * files" loop signature (SA4E-368 UAT: the model re-read the same files with
 * varying offset/limit for 162 calls before the guard caught it).
 *
 * Deliberately EXCLUDES sweep tools (grep/find): re-running the same pattern
 * over DIFFERENT paths is legitimate repo-wide exploration, not a loop —
 * those stay on the identical-args ladder.
 */
export const READ_TARGET_TOOLS = new Set(['read', 'ls']);

/** Stable exploration target of a read-class tool call (object args). */
export function readTargetOfArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const a = args as Record<string, unknown>;
  const t = a.file_path ?? a.path ?? a.pattern ?? a.glob;
  return typeof t === 'string' ? t.trim().slice(0, 200) : '';
}

/** readTargetOfArgs over a JSON args string; junk tolerated (returns ''). */
export function extractReadTarget(argsJson: string): string {
  if (!argsJson) return '';
  try {
    return readTargetOfArgs(JSON.parse(argsJson));
  } catch {
    return '';
  }
}
