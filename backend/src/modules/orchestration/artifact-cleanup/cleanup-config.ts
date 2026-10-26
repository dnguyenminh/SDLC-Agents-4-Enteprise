/**
 * OI-15 — cleanup sweep configuration (TDD §9.2).
 *
 * BRD config keys → environment variables (backend reads config via env, the
 * platform's existing pattern):
 *   artifact.cleanup.enabled    → ARTIFACT_CLEANUP_ENABLED    (default true)
 *   artifact.cleanup.intervalMs → ARTIFACT_CLEANUP_INTERVAL_MS (default 300_000)
 *   artifact.cleanup.ttlMs      → ARTIFACT_CLEANUP_TTL_MS      (default 600_000)
 *   artifact.cleanup.maxRunMs   → ARTIFACT_CLEANUP_MAX_RUN_MS  (default 30_000)
 */

export interface ArtifactCleanupConfig {
  /** Master switch — false never starts the sweep timer. */
  enabled: boolean;
  /** Sweep cadence (timer-based). */
  intervalMs: number;
  /** Minimum file age before a matching artifact counts as orphaned. */
  ttlMs: number;
  /** Hard bound per sweep run; overrun → stop the tick and log. */
  maxRunMs: number;
}

export const ARTIFACT_CLEANUP_DEFAULTS: Readonly<ArtifactCleanupConfig> = Object.freeze({
  enabled: true,
  intervalMs: 300_000,
  ttlMs: 600_000,
  maxRunMs: 30_000,
});

/** Load the cleanup config from the given environment (defaults when unset). */
export function loadArtifactCleanupConfig(env: NodeJS.ProcessEnv = process.env): ArtifactCleanupConfig {
  return {
    enabled: boolEnv(env['ARTIFACT_CLEANUP_ENABLED'], ARTIFACT_CLEANUP_DEFAULTS.enabled),
    intervalMs: intEnv(env['ARTIFACT_CLEANUP_INTERVAL_MS'], ARTIFACT_CLEANUP_DEFAULTS.intervalMs),
    ttlMs: intEnv(env['ARTIFACT_CLEANUP_TTL_MS'], ARTIFACT_CLEANUP_DEFAULTS.ttlMs),
    maxRunMs: intEnv(env['ARTIFACT_CLEANUP_MAX_RUN_MS'], ARTIFACT_CLEANUP_DEFAULTS.maxRunMs),
  };
}

function boolEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function intEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
