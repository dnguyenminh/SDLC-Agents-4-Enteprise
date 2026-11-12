/**
 * SA4E-406 — ONE pass of the fix dispatch (extracted from drawio-apply for the
 * verify loop): pick the minimal strategy able to resolve the issues and run
 * it. The caller (drawio-verify-loop) repeats passes with escalating spacing
 * and assembles the output contract.
 *
 * Strategy order: sequence rebuild → use-case rebuild → ports-only →
 * full ELK/humanized relayout → minimal local repair (escalating to relayout
 * when the repair cannot act or would not help).
 */

import type { DiagramGraph } from './drawio-parser';
import { parseDrawioXml } from './drawio-parser';
import type { NormalizedArgs } from './drawio-layout-models';
import type { LayoutIssue } from './drawio-detect';
import { detectAllIssues } from './drawio-detect';
import { sanitizeDrawioXml } from './drawio-xml-sanitize';
import { normalizePointSequence } from './drawio-sequence-points';
import { sequenceRelayout } from './drawio-sequence-apply';
import { detectSequenceDiagram } from './drawio-detect-sequence';
import { detectUseCaseDiagram } from './drawio-detect-usecase';
import { useCaseRelayout } from './drawio-usecase-apply';
import { RELAYOUT_RATIO, normalizeLayoutArgs, violationRatio } from './drawio-apply-args';
import { planLocalRepair } from './drawio-repair';
import { applyRepairPlan, applyPortDistribution } from './drawio-patch';
import { applyEdgePlans, planEdges } from './drawio-edge-plan';
import { placeLabels } from './drawio-label-place';
import { commitLayout, error, validateReparse } from './drawio-apply-validate';
import { elkRelayout } from './drawio-apply-relayout';

/** What one strategy pass reports back to the verify loop. */
export interface StrategySignal {
  status: string;
  message: string;
  strategy: string;
  wrote: boolean;
  error?: string;
}

/**
 * Run ONE strategy pass on `rawXml`. `forceRelayout` (verify iterations ≥ 2,
 * or relayout=true) skips the minimal-repair choice for the full relayout.
 */
export async function runStrategy(
  rawXml: string, issues: LayoutIssue[], nodeCount: number,
  args: Record<string, unknown>, filePath: string, forceRelayout: boolean,
): Promise<StrategySignal> {
  const graph = parseDrawioXml(rawXml);
  const { json, strategy } = await dispatch(rawXml, graph, issues, nodeCount, args, filePath, forceRelayout);
  return toSignal(json, strategy);
}

/** Translate a strategy's JSON result into the loop's signal shape. */
function toSignal(json: string, strategy: string): StrategySignal {
  let parsed: { status?: string; message?: string; error?: string };
  try { parsed = JSON.parse(json); } catch {
    return { status: 'error', message: '', strategy, wrote: false, error: 'Strategy returned no JSON result' };
  }
  if (parsed.error) return { status: 'error', message: parsed.error, strategy, wrote: false, error: parsed.error };
  const status = parsed.status ?? 'fixed';
  return { status, message: parsed.message ?? '', strategy, wrote: status !== 'already_good' };
}

type Dispatch = { json: string; strategy: string };

async function dispatch(
  rawXml: string, graph: DiagramGraph, issues: LayoutIssue[], nodeCount: number,
  args: Record<string, unknown>, filePath: string, forceRelayout: boolean,
): Promise<Dispatch> {
  // Free-floating sequence diagram (lifelines/messages without terminals): connect it first
  const drawn = normalizePointSequence(sanitizeDrawioXml(rawXml).xml);
  if (drawn) return { strategy: 'sequence', json: sequenceRelayout(drawn.xml, issues, filePath, validateReparse) };
  const sequence = detectSequenceDiagram(graph);
  if (sequence.isSequence) {
    return { strategy: 'sequence', json: sequenceRelayout(sanitizeDrawioXml(rawXml).xml, issues, filePath, validateReparse) };
  }
  const useCase = detectUseCaseDiagram(graph);
  if (useCase) return { strategy: 'use_case', json: useCaseRelayout(rawXml, graph, useCase, issues, filePath, validateReparse) };
  const normalized = normalizeLayoutArgs(args);
  if (normalized.scope === 'ports') {
    return { strategy: 'ports_only', json: handlePortsOnlyFix(rawXml, graph, issues, filePath) };
  }
  if (needsFullRelayout(graph, issues, normalized, forceRelayout)) {
    const name = normalized.algorithm === 'layered' ? 'humanized_layered' : `elk_${normalized.algorithm}`;
    return { strategy: name, json: await elkRelayout(rawXml, graph, issues, normalized, filePath) };
  }
  return { strategy: 'local_repair', json: await localRepairPath(rawXml, graph, issues, normalized, filePath) };
}

/** Full relayout when forced, or when the damage is structural/widespread. */
function needsFullRelayout(
  graph: DiagramGraph, issues: LayoutIssue[], normalized: NormalizedArgs, forceRelayout: boolean,
): boolean {
  return forceRelayout || normalized.relayout || normalized.scope === 'positions'
    || issues.some(i => i.type === 'extreme_aspect_ratio')
    // Children outside their container means the band structure itself is off; local repair only
    // nudges nodes and leaves the bands wherever they were (often far apart), the full relayout
    // rebuilds the whole arrangement.
    || issues.some(i => i.type === 'child_outside_container')
    || violationRatio(graph, issues) > RELAYOUT_RATIO;
}

/** Minimal path: move only violating nodes and reroute affected edges. */
async function localRepairPath(
  rawXml: string, graph: DiagramGraph, issues: LayoutIssue[],
  normalized: NormalizedArgs, filePath: string,
): Promise<string> {
  try {
    const plan = planLocalRepair(graph, issues, normalized.spacing);
    // Node moves/resizes come from the repair plan. Edges are ALWAYS re-planned by the grid
    // router on the repaired geometry: the legacy single-obstacle detours in plan.routes
    // routinely cut through other nodes or run diagonally.
    const moved = applyRepairPlan(rawXml, { ...plan, routes: new Map() });
    const edgePlans = planEdges(parseDrawioXml(moved));
    const xml = placeLabels(applyEdgePlans(moved, edgePlans));
    if (xml === rawXml || !improvesDiagram(issues, xml)) {
      // Repair could not act, or would not help. A full relayout only pays off
      // for issues it demonstrably fixes — edge-cosmetic leftovers (stacked
      // parallel edges survive every re-route) and gate-fixable ones (off-grid)
      // stay flagged instead of triggering a destructive rewrite (SA4E-406).
      if (relayoutWouldHelp(issues)) {
        return await elkRelayout(rawXml, graph, issues, normalized, filePath);
      }
      return JSON.stringify({
        status: 'already_good',
        message: 'Local repair found no further improvement — the remaining issue(s) are reported.',
      });
    }
    const { graph: afterGraph } = commitLayout(xml, filePath);
    const remaining = detectAllIssues(afterGraph).filter(i => i.severity !== 'low').length;
    return JSON.stringify({
      status: 'fixed',
      message: `Local repair: moved ${plan.moves.size} nodes, re-routed ${edgePlans.length} edges.`,
      remaining_issues: remaining,
    });
  } catch (e: unknown) {
    console.error('[drawio-apply] Local repair error:', e);
    return error('Local repair failed. Please check diagram structure.');
  }
}

/** Issue types a full relayout + edge re-plan demonstrably resolves. */
const RELAYOUT_RELEVANT: ReadonlySet<string> = new Set([
  'node_overlap', 'node_proximity', 'child_outside_container', 'extreme_aspect_ratio',
  'edge_node_crossing', 'edge_edge_crossing', 'edge_container_crossing',
]);

/** True when at least one blocking issue is of a type a relayout fixes. */
function relayoutWouldHelp(issues: LayoutIssue[]): boolean {
  return issues.some(i => i.severity !== 'low' && RELAYOUT_RELEVANT.has(i.type));
}

/**
 * True when the candidate XML is a real improvement over the diagram it repairs:
 * fewer HIGH issues, or the same number of high and fewer medium ones. A plain total
 * is not enough — trading 8 stacked edges for 8 new overlaps looks like progress
 * by count but is worse.
 */
function improvesDiagram(before: LayoutIssue[], candidateXml: string): boolean {
  const count = (list: LayoutIssue[], sev: string): number => list.filter(i => i.severity === sev).length;
  const after = detectAllIssues(parseDrawioXml(candidateXml));
  const [hb, ha] = [count(before, 'high'), count(after, 'high')];
  return ha !== hb ? ha < hb : count(after, 'medium') < count(before, 'medium');
}

/** Ports-only path (scope='ports'): spread anchors, keep all node positions. */
function handlePortsOnlyFix(rawXml: string, graph: DiagramGraph, issues: LayoutIssue[], filePath: string): string {
  try {
    const xml = applyPortDistribution(rawXml, graph);
    if (xml === rawXml) {
      return JSON.stringify({ status: 'already_good', message: 'No edge routing improvements needed.' });
    }
    // PD-QA1: ports-only path — grid snap only, no debunch, so node positions
    // are preserved (FSD §3.1 L374).
    const { graph: afterGraph } = commitLayout(xml, filePath, { portsOnly: true });
    const remaining = detectAllIssues(afterGraph).filter(i => i.severity !== 'low').length;
    return JSON.stringify({
      status: 'fixed',
      message: `Fixed edge routing. ${issues.length} issues detected, ports distributed.`,
      remaining_issues: remaining,
    });
  } catch (e: unknown) {
    console.error('[drawio-apply] Edge-only fix error:', e);
    return error('Edge routing fix failed. Please check diagram structure.');
  }
}
