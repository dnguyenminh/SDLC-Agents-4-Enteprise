/**
 * Layout issue detectors for draw.io diagrams — node overlaps, proximity,
 * container containment. Edge-related detectors live in drawio-detect-edges.ts.
 * All comparisons use absolute rects (see drawio-geometry.ts).
 */

import type { DiagramGraph, DiagramNode } from './drawio-parser.js';
import { absoluteRects, ancestorsOf, cellIndex, fullyContains, overlapRatio, rectGap } from './drawio-geometry.js';
import { isFragmentFrame, isSequenceLifeline } from './drawio-style.js';
import type { Rect } from './drawio-geometry.js';
import { edgeNodeCrossings, edgeEdgeCrossings, edgeContainerCrossings } from './drawio-detect-edges.js';

export type Severity = 'high' | 'medium' | 'low';

export interface LayoutIssue {
  type: string;
  severity: Severity;
  [key: string]: unknown;
}

/** Minimum breathing room (px) between sibling nodes before flagging. */
export const MIN_GAP = 40;
/** Flag overlap once more than this fraction of the smaller node is covered. */
export const OVERLAP_EPS = 0.05;
/** Tolerance (px) when checking that children stay inside their container. */
const CONTAINMENT_TOL = 5;

/**
 * Detect all layout issues. Low severity (diagonal edges, proximity, containment
 * hints) is cosmetic — callers gate auto-fix on high/medium only.
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
    ...detectDiagonalEdges(graph),
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
  } else if (ratio > OVERLAP_EPS) {
    issues.push({
      type: 'node_overlap', severity: 'high',
      node_a: a.id, node_b: b.id, ratio: Math.round(ratio * 100) / 100,
      fix_hint: `Move '${b.id}' away from '${a.id}' (overlap ${(ratio * 100).toFixed(0)}%).`,
    });
  }
}

/**
 * Sibling or top-level nodes closer than MIN_GAP (overlaps reported separately).
 * Severity LOW: tight spacing is often intentional (legends, notes, icon rows) —
 * reported for visibility, never auto-fixed.
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
      const ra = rects.get(a.id)!, rb = rects.get(b.id)!;
      if (overlapRatio(ra, rb) > 0) continue;
      const gap = rectGap(ra, rb);
      if (gap >= 0 && gap < MIN_GAP) {
        issues.push({
          type: 'node_proximity', severity: 'low',
          node_a: a.id, node_b: b.id, gap: Math.round(gap),
          fix_hint: `'${a.id}' and '${b.id}' are ${Math.round(gap)}px apart (recommended ${MIN_GAP}px).`,
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
export function detectDiagonalEdges(graph: DiagramGraph): LayoutIssue[] {
  const byId = cellIndex(graph);
  const abs = absoluteRects(graph);
  const tolerance = 20; // px threshold for "diagonal"
  const issues: LayoutIssue[] = [];
  for (const edge of graph.edges) {
    const src = abs.get(edge.sourceId), tgt = abs.get(edge.targetId);
    if (!src || !tgt) continue;
    if (!byId.has(edge.sourceId) || !byId.has(edge.targetId)) continue;
    const dx = Math.abs((src.x + src.w / 2) - (tgt.x + tgt.w / 2));
    const dy = Math.abs((src.y + src.h / 2) - (tgt.y + tgt.h / 2));
    if (dx > tolerance && dy > tolerance) {
      issues.push({
        type: 'diagonal_edge', severity: 'low',
        edge_id: edge.id, edge_source: edge.sourceId, edge_target: edge.targetId,
        fix_hint: `Edge '${edge.id}' is diagonal — set relayout:true or add waypoints.`,
      });
    }
  }
  return issues;
}
