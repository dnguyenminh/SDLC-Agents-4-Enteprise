/**
 * SA4E-84 — full-relayout strategies of the apply orchestrator:
 * humanized (layered, default) and classic nested ELK (force/mrtree/radial).
 */

import * as fs from 'fs';
import type { DiagramGraph } from './drawio-parser';
import { parseDrawio, parseDrawioXml } from './drawio-parser';
import type { NormalizedArgs } from './drawio-layout-models';
import { buildElkGraph, runElkLayout } from './elk-layout';
import { humanizeLayout } from './drawio-humanize';
import { applyLayoutToXml } from './drawio-writer';
import { detectAllIssues, type LayoutIssue } from './drawio-detect';
import { sanitizeDrawioXml } from './drawio-xml-sanitize';
import { applyEdgePlans, planEdges } from './drawio-edge-plan';
import { TIMEOUT_MS } from './drawio-apply-args';
import { error, validateReparse } from './drawio-apply-validate';

/** Full ELK relayout (compound-safe: containers are laid out hierarchically). */
export async function elkRelayout(
  rawXml: string, graph: DiagramGraph, issues: LayoutIssue[],
  normalized: NormalizedArgs, filePath: string,
): Promise<string> {
  // SA4E-406 UAT feedback: plain ELK layered + DOWN stacks EVERYTHING vertically
  // (tall narrow bands, zigzag root) — nothing like a human arrangement. The
  // humanize strategy (default for the layered algorithm) lays each band's
  // interior out left-to-right (wide bands) and packs the bands in a clean
  // aligned grid; force/mrtree/radial keep the classic nested ELK run.
  if (normalized.algorithm === 'layered') {
    return humanizeRelayout(rawXml, graph, issues, normalized, filePath);
  }
  return nestedElkRelayout(rawXml, graph, issues, normalized, filePath);
}

/** Humanized relayout: per-band horizontal interiors + root grid pack. */
async function humanizeRelayout(
  rawXml: string, graph: DiagramGraph, issues: LayoutIssue[],
  normalized: NormalizedArgs, filePath: string,
): Promise<string> {
  try {
    // Relayout re-places every cell, so container auto-layout styles (which
    // would let draw.io re-stack children on edit) must go before we write.
    const base = sanitizeDrawioXml(rawXml, { stripAutoLayout: true }).xml;
    const laidOut = await humanizeLayout(graph, normalized, TIMEOUT_MS);
    const { xml: placed, repositionedNodes } = applyLayoutToXml(base, laidOut);
    // Old waypoints/terminals/parents are meaningless after the move: re-plan
    // every edge from the geometry that was actually written.
    const plans = planEdges(parseDrawioXml(placed));
    const xml = applyEdgePlans(placed, plans);
    if (repositionedNodes.length === 0 && xml === rawXml) {
      return JSON.stringify({
        status: 'already_good',
        message: `Humanized ${normalized.algorithm} layout produced identical positions — diagram already at layout optimum.`,
        remaining_issues: issues.filter(i => i.severity !== 'low').length,
      });
    }
    validateReparse(xml);
    fs.writeFileSync(filePath, xml, 'utf-8');
    const { graph: afterGraph } = parseDrawio(filePath);
    const remainingIssues = detectAllIssues(afterGraph).filter(i => i.severity !== 'low').length;
    return JSON.stringify({
      status: 'fixed',
      message: `Fixed ${issues.length} issues with humanized ${normalized.algorithm} layout. ${repositionedNodes.length} nodes repositioned, ${plans.length} edges re-routed.`,
      remaining_issues: remainingIssues,
    });
  } catch (e: unknown) {
    console.error('[drawio-apply] humanized layout error:', e);
    return error(`Layout engine failed: ${e instanceof Error ? e.message : e}`);
  }
}

/** Classic nested ELK relayout (compound-safe) — non-layered algorithms. */
async function nestedElkRelayout(
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
