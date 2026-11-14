/**
 * SA4E-84 — argument normalisation, limits and the relayout-vs-repair ratio
 * used by the drawio_auto_layout apply orchestrator.
 */

import type { DiagramGraph } from './drawio-parser';
import type { NormalizedArgs } from './drawio-layout-models';
import type { LayoutIssue, DetectThresholds } from './drawio-detect';
import { DEFAULT_DETECT_THRESHOLDS, MIN_GAP, OVERLAP_EPS } from './drawio-detect';

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

/** SA4E-406 (M3): byte cap before the FIRST read — aligned with the proxy pre-read cap (Base64ProxyService PROXY_PRE_READ_MAX_BYTES). */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
/** Cheap pre-parse ceiling on mxCell open tags (nodes + edges + labels). */
export const MAX_INPUT_CELLS = 10_000;

/**
 * SA4E-406 (A1): optional detector thresholds from tool args — `gap_threshold`
 * (px, default MIN_GAP) and `overlap_threshold` (fraction, default OVERLAP_EPS).
 * Undefined when neither is present; throws an actionable error on negatives
 * or otherwise meaningless values.
 */
export function parseThresholdArgs(args: Record<string, unknown>): DetectThresholds | undefined {
  const gap = args.gap_threshold;
  const overlap = args.overlap_threshold;
  if (gap !== undefined
    && (typeof gap !== 'number' || !Number.isFinite(gap) || gap < 0 || gap > MAX_SPACING)) {
    throw new Error(`gap_threshold must be a number between 0 and ${MAX_SPACING} (pixels, got ${JSON.stringify(gap)}) — omit it to use the default ${MIN_GAP}px.`);
  }
  if (overlap !== undefined
    && (typeof overlap !== 'number' || !Number.isFinite(overlap) || overlap < 0 || overlap >= 1)) {
    throw new Error(`overlap_threshold must be a number between 0 and 1 (fraction of the smaller node, got ${JSON.stringify(overlap)}) — omit it to use the default ${OVERLAP_EPS}.`);
  }
  if (gap === undefined && overlap === undefined) return undefined;
  return {
    gap: typeof gap === 'number' ? gap : MIN_GAP,
    overlap: typeof overlap === 'number' ? overlap : OVERLAP_EPS,
  };
}

/** Resolve the effective thresholds for one immutable tool run. */
export function resolveDetectThresholds(t?: DetectThresholds): DetectThresholds {
  return t ? { ...t } : { ...DEFAULT_DETECT_THRESHOLDS };
}

/** Fraction of cells involved in at least one blocking issue. */
export function violationRatio(graph: DiagramGraph, issues: LayoutIssue[]): number {
  const total = graph.nodes.length + graph.containers.length;
  if (total === 0) return 1;
  const cells = new Set([...graph.nodes, ...graph.containers].map(cell => cell.id));
  const edges = new Map(graph.edges.map(edge => [edge.id, edge]));
  const involved = new Set<string>();
  for (const issue of issues) {
    if (issue.severity === 'low') continue;
    addDirectCells(issue, cells, involved);
    addEdgeEndpoints(issue, edges, cells, involved);
  }
  return involved.size / total;
}

/** Add issue fields that already identify a graph cell. */
function addDirectCells(issue: LayoutIssue, cells: Set<string>, involved: Set<string>): void {
  const keys = [
    'node_a', 'node_b', 'child', 'container', 'node', 'crosses_node',
    'crosses_container', 'parent', 'expected', 'edge_source', 'edge_target',
  ];
  for (const key of keys) {
    const id = issue[key];
    if (typeof id === 'string' && cells.has(id)) involved.add(id);
  }
}

/** Resolve edge ids to their endpoint cells; edge ids are not cell ids. */
function addEdgeEndpoints(
  issue: LayoutIssue, edges: Map<string, DiagramGraph['edges'][number]>,
  cells: Set<string>, involved: Set<string>,
): void {
  for (const key of ['edge_id', 'edge_a', 'edge_b']) {
    const edgeId = issue[key];
    if (typeof edgeId !== 'string') continue;
    const edge = edges.get(edgeId);
    if (!edge) continue;
    if (cells.has(edge.sourceId)) involved.add(edge.sourceId);
    if (cells.has(edge.targetId)) involved.add(edge.targetId);
  }
}

/** Normalize layout args with safe defaults and upper bounds (SEC-03). */
export function normalizeLayoutArgs(args: Record<string, unknown>): NormalizedArgs {
  const VALID_ALG = ['layered', 'force', 'mrtree', 'radial', 'stress'];
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
