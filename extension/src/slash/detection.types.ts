/**
 * Result shapes shared by the static / rendered / full detection modules.
 * Re-exported from integration.service.ts to keep the public API stable.
 */
import type { Finding } from "./types";

/** Detection result combined for full pipeline runs. */
export interface CombinedResult {
  findings: Finding[];
  fileCount: number;
  durationMs: number;
  cacheHit: boolean;
  partial: boolean;
}

/**
 * Rendered-mode result — CombinedResult fields plus rendered-specific metadata.
 * (CombinedResult-compatible so full detection can aggregate uniformly.)
 */
export interface RenderedDetectionResult extends CombinedResult {
  /** Aggregated score from the rendered analysis (0-1). */
  score: number;
  /** "success" | "failed" | "skipped" (circuit breaker / SSRF / unreachable). */
  fetchStatus: string;
  /** Number of pages actually fetched. */
  pagesFetched: number;
}

/** Options accepted by static detection. */
export interface StaticOptions {
  threshold?: number;
  cacheReuse?: boolean;
  /** SEC-F08: explicit workspace root — required, no env/cwd fallback. */
  workspaceRoot: string;
}

/** Options accepted by rendered detection. */
export interface RenderedOptions {
  threshold?: number;
  /** Required workspace root (no env/cwd fallback). */
  workspaceRoot: string;
}
