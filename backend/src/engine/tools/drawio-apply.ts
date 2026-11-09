/**
 * SA4E-84 — Apply orchestrator for drawio_auto_layout fix mode.
 * Strategy (minimal first): ports-only → local repair → full ELK relayout.
 * Writes fixed XML directly to file. Returns metadata only (no content_base64).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { DiagramGraph } from './drawio-parser.js';
import { parseDrawio } from './drawio-parser.js';
import type { NormalizedArgs } from './drawio-layout-models.js';
import { buildElkGraph, runElkLayout } from './elk-layout.js';
import { applyLayoutToXml } from './drawio-writer.js';
import { planLocalRepair } from './drawio-repair.js';
import { applyRepairPlan, applyPortDistribution } from './drawio-patch.js';
import { detectAllIssues, type LayoutIssue } from './drawio-detect.js';

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
const MAX_NODES = parseEnvInt('SA4E_ELK_MAX_NODES', 500, 1, 5000);
// SA4E-406 UAT feedback: 10s default was too short for compound diagrams
// (architecture.drawio: 26 nodes/4 containers → ELK layered > 10s under load).
// 30s default, hard cap 120s via env (SEC-02 bounds updated accordingly).
const TIMEOUT_MS = parseEnvInt('SA4E_ELK_TIMEOUT_MS', 30_000, 1000, 120_000);
/** Full relayout kicks in when more than this fraction of cells are involved. */
const RELAYOUT_RATIO = 0.4;
/** Maximum spacing in pixels to prevent resource exhaustion (SEC-03). */
const MAX_SPACING = 500;

/**
 * Orchestrate the fix: choose the minimal strategy able to resolve the issues,
 * apply it, validate by re-parsing, and write the file.
 * @returns JSON string with status + message (metadata only)
 */
export async function handleApply(
  rawXml: string, graph: DiagramGraph, issues: LayoutIssue[], nodeCount: number,
  args: Record<string, unknown>, filePath: string,
): Promise<string> {
  if (nodeCount > MAX_NODES) return error(`Diagram too large (${nodeCount} nodes, max ${MAX_NODES})`);
  const normalized = normalizeLayoutArgs(args);
  if (normalized.scope === 'ports') return handlePortsOnlyFix(rawXml, graph, issues, filePath);
  const needsFull = normalized.relayout || normalized.scope === 'positions'
    || violationRatio(graph, issues) > RELAYOUT_RATIO;
  if (needsFull) return elkRelayout(rawXml, graph, issues, normalized, filePath);
  return await localRepairPath(rawXml, graph, issues, normalized, filePath);
}

/** Full ELK relayout (compound-safe: containers are laid out hierarchically). */
async function elkRelayout(
  rawXml: string, graph: DiagramGraph, issues: LayoutIssue[],
  normalized: NormalizedArgs, filePath: string,
): Promise<string> {
  try {
    const elkGraph = buildElkGraph(graph, normalized);
    const laidOut = await runElkLayout(elkGraph, TIMEOUT_MS);
    const { xml, repositionedNodes } = applyLayoutToXml(rawXml, laidOut);
    // SA4E-406 UAT: deterministic algorithms (layered) can legitimately produce
    // identical positions on a re-run — that is "already optimal", NOT an error.
    // The old code returned error() here, which surfaced as a spurious failure
    // whenever a second relayout ran on a fixed file.
    if (repositionedNodes.length === 0 && xml === rawXml) {
      return JSON.stringify({
        status: 'already_good',
        message: `ELK ${normalized.algorithm} layout produced identical positions — diagram already at layout optimum.`,
        remaining_issues: issues.filter(i => i.severity !== 'low').length,
      });
    }
    validateReparse(xml);
    fs.writeFileSync(filePath, xml, 'utf-8');
    // Re-detect remaining issues after fix
    const { graph: afterGraph } = parseDrawio(filePath);
    const remainingIssues = detectAllIssues(afterGraph).filter(i => i.severity !== 'low').length;
    return JSON.stringify({
      status: 'fixed',
      message: `Fixed ${issues.length} issues with ELK ${normalized.algorithm} layout. ${repositionedNodes.length} nodes repositioned.`,
      remaining_issues: remainingIssues,
    });
  } catch (e: unknown) {
    console.error('[drawio-apply] ELK layout error:', e);
    return error('Layout engine failed. Please check input diagram and retry.');
  }
}

/** Minimal path: move only violating nodes and reroute affected edges. */
async function localRepairPath(
  rawXml: string, graph: DiagramGraph, issues: LayoutIssue[],
  normalized: NormalizedArgs, filePath: string,
): Promise<string> {
  try {
    const plan = planLocalRepair(graph, issues, normalized.spacing);
    const xml = applyRepairPlan(rawXml, plan);
    if (xml === rawXml) {
      // Repair could not act (e.g. router found no detour) — escalate to ELK
      return await elkRelayout(rawXml, graph, issues, normalized, filePath);
    }
    validateReparse(xml);
    fs.writeFileSync(filePath, xml, 'utf-8');
    // Re-detect remaining issues after fix
    const { graph: afterGraph } = parseDrawio(filePath);
    const remainingIssues = detectAllIssues(afterGraph).filter(i => i.severity !== 'low').length;
    return JSON.stringify({
      status: 'fixed',
      message: `Local repair: moved ${plan.moves.size} nodes, rerouted ${plan.routes.size} edges.`,
      remaining_issues: remainingIssues,
    });
  } catch (e: unknown) {
    console.error('[drawio-apply] Local repair error:', e);
    return error('Local repair failed. Please check diagram structure.');
  }
}

/** Ports-only path (scope='ports'): spread anchors, keep all node positions. */
function handlePortsOnlyFix(rawXml: string, graph: DiagramGraph, issues: LayoutIssue[], filePath: string): string {
  try {
    const xml = applyPortDistribution(rawXml, graph);
    if (xml === rawXml) {
      return JSON.stringify({ status: 'already_good', message: 'No edge routing improvements needed.' });
    }
    validateReparse(xml);
    fs.writeFileSync(filePath, xml, 'utf-8');
    // Re-detect remaining issues after fix
    const { graph: afterGraph } = parseDrawio(filePath);
    const remainingIssues = detectAllIssues(afterGraph).filter(i => i.severity !== 'low').length;
    return JSON.stringify({
      status: 'fixed',
      message: `Fixed edge routing. ${issues.length} issues detected, ports distributed.`,
      remaining_issues: remainingIssues,
    });
  } catch (e: unknown) {
    console.error('[drawio-apply] Edge-only fix error:', e);
    return error('Edge routing fix failed. Please check diagram structure.');
  }
}

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
  const direction = typeof args.direction === 'string' && VALID_DIR.includes(args.direction.toUpperCase())
    ? args.direction.toUpperCase() : 'DOWN';
  const scope = typeof args.scope === 'string' && VALID_SCOPE.includes(args.scope)
    ? args.scope as NormalizedArgs['scope'] : 'auto';
  const relayout = args.relayout === true;
  return { algorithm, spacing, direction, scope, relayout };
}

/** BR-7: Re-parse fixed XML to ensure it's valid before writing to file. */
function validateReparse(xml: string): void {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-fix-'));
  try {
    const tmpFile = path.join(tmpDir, 'fixed.drawio');
    fs.writeFileSync(tmpFile, xml, 'utf-8');
    parseDrawio(tmpFile); // Throws if XML is broken
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupErr: unknown) {
      console.error('[drawio-apply] Temp cleanup failed:', cleanupErr);
    }
  }
}

function error(msg: string): string {
  return JSON.stringify({ error: msg });
}
