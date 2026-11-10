/**
 * SA4E-84 — Apply orchestrator for drawio_auto_layout fix mode.
 * Strategy (minimal first): ports-only → local repair → full ELK relayout.
 * Writes fixed XML directly to file. Returns metadata only (no content_base64).
 *
 * Helpers live next to it: drawio-apply-args (limits, args), drawio-apply-validate
 * (write gate), drawio-apply-relayout (full relayout strategies).
 */

import * as fs from 'fs';
import type { DiagramGraph } from './drawio-parser';
import { parseDrawio, parseDrawioXml } from './drawio-parser';
import type { NormalizedArgs } from './drawio-layout-models';
import { planLocalRepair } from './drawio-repair';
import { applyRepairPlan, applyPortDistribution } from './drawio-patch';
import { detectAllIssues, type LayoutIssue } from './drawio-detect';
import { sanitizeDrawioXml } from './drawio-xml-sanitize';
import { applyEdgePlans, planEdges } from './drawio-edge-plan';
import { detectSequenceDiagram } from './drawio-detect-sequence';
import { sequenceRelayout } from './drawio-sequence-apply';
import { normalizePointSequence } from './drawio-sequence-points';
import { detectUseCaseDiagram } from './drawio-detect-usecase';
import { useCaseRelayout } from './drawio-usecase-apply';
import { MAX_NODES, RELAYOUT_RATIO, normalizeLayoutArgs, violationRatio } from './drawio-apply-args';
import { error, validateReparse } from './drawio-apply-validate';
import { elkRelayout } from './drawio-apply-relayout';

// Public API of this module (importers use these names from './drawio-apply')
export { normalizeLayoutArgs, violationRatio };

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
  // Free-floating sequence diagram (lifelines and messages are edges without terminals): connect it first
  const drawn = normalizePointSequence(sanitizeDrawioXml(rawXml).xml);
  if (drawn) return sequenceRelayout(drawn.xml, issues, filePath, validateReparse);
  const sequence = detectSequenceDiagram(graph);
  if (sequence.isSequence) return sequenceRelayout(sanitizeDrawioXml(rawXml).xml, issues, filePath, validateReparse);
  const useCase = detectUseCaseDiagram(graph);
  if (useCase) return useCaseRelayout(rawXml, graph, useCase, issues, filePath, validateReparse);
  const normalized = normalizeLayoutArgs(args);
  if (normalized.scope === 'ports') return handlePortsOnlyFix(rawXml, graph, issues, filePath);
  const needsFull = normalized.relayout || normalized.scope === 'positions'
    || issues.some(i => i.type === 'extreme_aspect_ratio')
    // Children outside their container means the band structure itself is off; local repair only
    // nudges nodes and leaves the bands wherever they were (often far apart), the full relayout
    // rebuilds the whole arrangement.
    || issues.some(i => i.type === 'child_outside_container')
    || violationRatio(graph, issues) > RELAYOUT_RATIO;
  if (needsFull) return elkRelayout(rawXml, graph, issues, normalized, filePath);
  return await localRepairPath(rawXml, graph, issues, normalized, filePath);
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
    const xml = applyEdgePlans(moved, edgePlans);
    if (xml === rawXml || !improvesDiagram(issues, xml)) {
      // Repair could not act, or would not help — escalate to the full relayout
      return await elkRelayout(rawXml, graph, issues, normalized, filePath);
    }
    validateReparse(xml);
    fs.writeFileSync(filePath, xml, 'utf-8');
    // Re-detect remaining issues after fix
    const { graph: afterGraph } = parseDrawio(filePath);
    const remainingIssues = detectAllIssues(afterGraph).filter(i => i.severity !== 'low').length;
    return JSON.stringify({
      status: 'fixed',
      message: `Local repair: moved ${plan.moves.size} nodes, re-routed ${edgePlans.length} edges.`,
      remaining_issues: remainingIssues,
    });
  } catch (e: unknown) {
    console.error('[drawio-apply] Local repair error:', e);
    return error('Local repair failed. Please check diagram structure.');
  }
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
