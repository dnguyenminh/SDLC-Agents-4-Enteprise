/**
 * SA4E-84 — argument normalisation, limits and the relayout-vs-repair ratio
 * used by the drawio_auto_layout apply orchestrator.
 */

import type { DiagramGraph } from './drawio-parser';
import type { NormalizedArgs } from './drawio-layout-models';
import type { LayoutIssue } from './drawio-detect';

/**
 * Parse an integer from environment variable with bounds validation (SEC-02).
 * Returns defaultVal if env var is missing, NaN, out of bounds, or non-finite.
 */
function parseEnvInt(envVar: string, defaultVal: number, min: number, max: number): number {
  const raw = process.env[envVar];
  if (raw === undefined) return defaultVal;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return defaultVal;
  return Math.floor(parsed);
}

// BR-7: configurable limits via env (NFR-P5) — with bounds validation (SEC-02)
export const MAX_NODES = parseEnvInt('SA4E_ELK_MAX_NODES', 500, 1, 5000);
// SA4E-406 UAT feedback: 10s default was too short for compound diagrams
// (architecture.drawio: 26 nodes/4 containers → ELK layered > 10s under load).
// 30s default, hard cap 120s via env (SEC-02 bounds updated accordingly).
export const TIMEOUT_MS = parseEnvInt('SA4E_ELK_TIMEOUT_MS', 30_000, 1000, 120_000);
/** Full relayout kicks in when more than this fraction of cells are involved. */
export const RELAYOUT_RATIO = 0.4;
/** Maximum spacing in pixels to prevent resource exhaustion (SEC-03). */
const MAX_SPACING = 500;

/** Fraction of cells involved in at least one blocking issue. */
export function violationRatio(graph: DiagramGraph, issues: LayoutIssue[]): number {
  const total = graph.nodes.length + graph.containers.length;
  if (total === 0) return 1;
  const involved = new Set<string>();
  for (const issue of issues) {
    for (const key of ['node_a', 'node_b', 'child']) {
      if (typeof issue[key] === 'string') involved.add(issue[key] as string);
    }
  }
  return involved.size / total;
}

/** Normalize layout args with safe defaults and upper bounds (SEC-03). */
export function normalizeLayoutArgs(args: Record<string, unknown>): NormalizedArgs {
  const VALID_ALG = ['layered', 'force', 'mrtree', 'radial'];
  const VALID_DIR = ['DOWN', 'RIGHT', 'LEFT', 'UP'];
  const VALID_SCOPE = ['auto', 'positions', 'ports'];
  const algorithm = typeof args.algorithm === 'string' && VALID_ALG.includes(args.algorithm)
    ? args.algorithm : 'layered';
  const rawSpacing = typeof args.spacing === 'number' && args.spacing > 0 ? args.spacing : 80;
  const spacing = Math.min(rawSpacing, MAX_SPACING);
  const directionExplicit = typeof args.direction === 'string' && VALID_DIR.includes(args.direction.toUpperCase());
  const direction = directionExplicit ? (args.direction as string).toUpperCase() : 'DOWN';
  const scope = typeof args.scope === 'string' && VALID_SCOPE.includes(args.scope)
    ? args.scope as NormalizedArgs['scope'] : 'auto';
  const relayout = args.relayout === true;
  return { algorithm, spacing, direction, scope, relayout, directionExplicit };
}
