/**
 * Layout issue detectors for draw.io diagrams — node overlaps, proximity,
 * container containment. Edge-related detectors live in drawio-detect-edges.ts.
 * All comparisons use absolute rects (see drawio-geometry.ts).
 */

import type { DiagramGraph, DiagramNode } from './drawio-parser';
import { absoluteRects, ancestorsOf, cellIndex, fullyContains, overlapRatio, rectGap } from './drawio-geometry';
import { isFragmentFrame, isSequenceLifeline, isTextRow } from './drawio-style';
import type { Point, Rect } from './drawio-geometry';
import { edgePolyline } from './drawio-polyline';
import { edgeNodeCrossings, edgeEdgeCrossings, edgeContainerCrossings } from './drawio-detect-edges';
import { detectExtremeAspect } from './drawio-detect-aspect';
import { detectLabelOnHeader, detectLabelOnNode } from './drawio-detect-labels';
import {
  detectBandOversize, detectEmptyLaneTitles, detectEdgeWrongParent, detectMissingDecisionLabels, detectOffGrid,
} from './drawio-detect-structure';

export type Severity = 'high' | 'medium' | 'low';

export interface LayoutIssue {
  type: string;
  severity: Severity;
  [key: string]: unknown;
}

/** Default minimum breathing room (px) between sibling nodes before flagging. */
export const MIN_GAP = 40;
/** Default overlap flag threshold: fraction of the smaller node covered. */
export const OVERLAP_EPS = 0.05;
/** Tolerance (px) when checking that children stay inside their container. */
const CONTAINMENT_TOL = 5;

/** Detector thresholds of the CURRENT run (tool params, defaults when unset — A1). */
export interface DetectThresholds { gap: number; overlap: number; }
let thresholds: DetectThresholds = { gap: MIN_GAP, overlap: OVERLAP_EPS };

/** Configure the detector thresholds for this tool run; undefined restores defaults. */
export function configureDetectThresholds(t: DetectThresholds | undefined): void {
  thresholds = t ? { ...t } : { gap: MIN_GAP, overlap: OVERLAP_EPS };
}

/** Active detector thresholds (for messages and tests). */
export function detectThresholds(): DetectThresholds {
  return thresholds;
}

/**
 * Detect all layout issues. Low severity (diagonal edges, containment hints)
 * is cosmetic — callers gate auto-fix on high/medium only.
 */
export function detectAllIssues(graph: DiagramGraph): LayoutIssue[] {
  const abs = absoluteRects(graph);
  return [
    ...detectNodeOverlaps(graph, abs),
    ...detectNodeProximity(graph, abs),
    ...detectChildOutsideContainer(graph, abs),
    ...edgeNodeCrossings(graph, abs),
    ...edgeEdgeCrossings(graph, abs),
    ...edgeContainerCrossings(graph, abs),
    ...detectDiagonalEdges(graph, abs),
    ...detectExtremeAspect(graph, abs),
    ...detectLabelOnHeader(graph, abs),
    ...detectLabelOnNode(graph, abs),
    ...detectOffGrid(graph, abs),
    ...detectEmptyLaneTitles(graph),
    ...detectMissingDecisionLabels(graph),
    ...detectBandOversize(graph, abs),
    ...detectEdgeWrongParent(graph),
  ];
}

/** Any node/container pair covering more than OVERLAP_EPS of the smaller one. */
export function detectNodeOverlaps(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const byId = cellIndex(graph);
  const cells = [...graph.nodes, ...graph.containers];
  const issues: LayoutIssue[] = [];
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i], b = cells[j];
      // Parent/child containment is legitimate — ancestorsOf covers it
      if (ancestorsOf(a.id, byId).has(b.id) || ancestorsOf(b.id, byId).has(a.id)) continue;
      pushOverlapIssue(issues, rects, a, b);
    }
  }
  return issues;
}

/**
 * Classify one pair: full containment and sequence constructs (lifelines,
 * fragment frames) are intentional layering — warn only; partial overlap of
 * plain content cells is always a bug.
 */
function pushOverlapIssue(
  issues: LayoutIssue[], rects: Map<string, Rect>, a: DiagramNode, b: DiagramNode,
): void {
  const ra = rects.get(a.id)!, rb = rects.get(b.id)!;
  const sequenceConstruct = isSequenceLifeline(a.style) || isSequenceLifeline(b.style)
    || isFragmentFrame(a.style, ra.w, ra.h) || isFragmentFrame(b.style, rb.w, rb.h);
  const ratio = overlapRatio(ra, rb);
  if (sequenceConstruct && ratio > 0) return; // designed to overlap content
  const contained = fullyContains(ra, rb) || fullyContains(rb, ra);
  if (contained) {
    issues.push({
      type: 'node_containment_hint', severity: 'low',
      node_a: a.id, node_b: b.id, ratio: Math.round(ratio * 100) / 100,
      fix_hint: `'${b.id}' sits inside '${a.id}' — consider parenting it for proper grouping.`,
    });
  } else if (ratio > thresholds.overlap) {
    issues.push({
      type: 'node_overlap', severity: 'high',
      node_a: a.id, node_b: b.id, ratio: Math.round(ratio * 100) / 100,
      fix_hint: `Move '${b.id}' away from '${a.id}' (overlap ${(ratio * 100).toFixed(0)}%).`,
    });
  }
}

/**
 * Sibling or top-level nodes closer than the configured gap (overlaps reported
 * separately). Severity MEDIUM (SA4E-406 b): bunched children are a real
 * defect the tool spreads — tight spacing is no longer cosmetic-only.
 */
export function detectNodeProximity(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const nodes = graph.nodes;
  const issues: LayoutIssue[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const sameScope = a.parentId === b.parentId;
      const topLevel = a.parentId === '1' && b.parentId === '1';
      if (!sameScope && !topLevel) continue;
      // Table/class rows are stacked flush by design
      if (isTextRow(a.style) && isTextRow(b.style)) continue;
      const ra = rects.get(a.id)!, rb = rects.get(b.id)!;
      if (overlapRatio(ra, rb) > 0) continue;
      const gap = rectGap(ra, rb);
      if (gap >= 0 && gap < thresholds.gap) {
        issues.push({
          type: 'node_proximity', severity: 'medium',
          node_a: a.id, node_b: b.id, gap: Math.round(gap),
          fix_hint: `'${a.id}' and '${b.id}' are ${Math.round(gap)}px apart (recommended ${thresholds.gap}px).`,
        });
      }
    }
  }
  return issues;
}

/** Children whose absolute rect escapes their parent container's bounds. */
export function detectChildOutsideContainer(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const byId = cellIndex(graph);
  const issues: LayoutIssue[] = [];
  for (const child of [...graph.nodes, ...graph.containers]) {
    const parent = byId.get(child.parentId);
    if (!parent) continue;
    const rc = rects.get(child.id)!, rp = rects.get(parent.id)!;
    const outside = rc.x < rp.x - CONTAINMENT_TOL || rc.y < rp.y - CONTAINMENT_TOL
      || rc.x + rc.w > rp.x + rp.w + CONTAINMENT_TOL || rc.y + rc.h > rp.y + rp.h + CONTAINMENT_TOL;
    if (outside) {
      issues.push({
        type: 'child_outside_container', severity: 'high',
        child: child.id, container: parent.id,
        fix_hint: `Keep '${child.id}' inside '${parent.id}' or resize the container.`,
      });
    }
  }
  return issues;
}

/** Near-45° connector courses — cosmetic only (severity: low). */
export function detectDiagonalEdges(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const byId = cellIndex(graph);
  const originOf = (id: string): Point => {
    const r = rects.get(id);
    return r ? { x: r.x, y: r.y } : { x: 0, y: 0 };
  };
  const issues: LayoutIssue[] = [];
  for (const edge of graph.edges) {
    if (!byId.has(edge.sourceId) || !byId.has(edge.targetId)) continue;
    // An edgeStyle (orthogonal/elbow/…) makes draw.io re-route the edge at
    // render time, so the straight anchor-to-anchor line is not what is drawn.
    if (/(^|;)edgeStyle=(?!none)/.test(edge.style)) continue;
    if (hasDiagonalSegment(edgePolyline(edge, rects, originOf))) {
      issues.push({
        type: 'diagonal_edge', severity: 'low',
        edge_id: edge.id, edge_source: edge.sourceId, edge_target: edge.targetId,
        fix_hint: `Edge '${edge.id}' is diagonal — set relayout:true or add waypoints.`,
      });
    }
  }
  return issues;
}

/** Any segment that moves noticeably on both axes (tolerance in px). */
function hasDiagonalSegment(line: Point[], tolerance = 5): boolean {
  return line.some((p, i) => i > 0
    && Math.abs(p.x - line[i - 1].x) > tolerance && Math.abs(p.y - line[i - 1].y) > tolerance);
}
