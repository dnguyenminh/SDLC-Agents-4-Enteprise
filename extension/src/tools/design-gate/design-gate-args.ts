/**
 * SA4E-393 — Argument parsing & validation for design_gate_run.
 * Extracted from design-gate-tool.ts to meet ≤200 lines/file standard.
 */

import { DEFAULT_THRESHOLD } from '../../slash/types';

/** Max findings echoed in tool output (agent context budget). Full report on disk. */
export const DEFAULT_FINDINGS_LIMIT = 200;

export interface ParsedRunArgs {
  mode: 'static' | 'rendered' | 'both';
  sourcePath: string | undefined;
  threshold: number;
  findingsLimit: number;
}

/** Parse and validate arguments for design_gate_run. */
export function parseRunArgs(args: Record<string, unknown>): ParsedRunArgs {
  const modeRaw = args.mode as string | undefined;
  const mode = (modeRaw ?? 'both') as 'static' | 'rendered' | 'both';
  if (!['static', 'rendered', 'both'].includes(mode)) {
    throw new Error(`Invalid mode: "${mode}". Allowed: static, rendered, both`);
  }
  const threshold = typeof args.threshold === 'number' ? args.threshold : DEFAULT_THRESHOLD;
  if (threshold < 0 || threshold > 1) {
    throw new Error(`threshold must be in [0, 1], got ${threshold}`);
  }
  const findingsLimit = typeof args.findings_limit === 'number' ? args.findings_limit : DEFAULT_FINDINGS_LIMIT;
  const sourcePath = typeof args.source_path === 'string' && args.source_path.trim() !== ''
    ? args.source_path.trim()
    : undefined;
  return { mode, sourcePath, threshold, findingsLimit };
}