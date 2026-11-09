/**
 * Edge-related layout detectors — edge through node, edge vs edge.
 * Uses reconstructed absolute polylines (exit/entry anchors, stored terminal
 * points and waypoints) and covers both anchored and loose (point-only) edges.
 */

import type { DiagramGraph } from './drawio-parser';
import type { DiagramEdge } from './drawio-parser';
import { absoluteRects, ancestorsOf, cellIndex, firstCrossPoint, fullyContains, segIntersectsRect, segsCross } from './drawio-geometry';
import { edgePolyline } from './drawio-polyline';
import { isFragmentFrame, isSequenceLifeline } from './drawio-style';
import type { Point, Rect } from './drawio-geometry';
import type { LayoutIssue } from './drawio-detect';

/** Tolerance (px) around shapes for crossing tests. */
const EDGE_MARGIN = 4;

/** Anchored edges plus loose point-only edges, in one iteration list. */
function allEdges(graph: DiagramGraph): DiagramEdge[] {
  return [...graph.edges, ...(graph.looseEdges ?? [])];
}

/**
 * Cells that act as background regions: they fully contain at least one other
 * cell, they are UML lifelines, or they are large dashed fragment frames.
 * Edges legitimately pass over them; actual visual defects are caught on the
 * CONTENT cells inside instead.
 */
function regionIds(graph: DiagramGraph, rects: Map<string, Rect>): Set<string> {
  const cells = [...graph.nodes, ...graph.containers];
  const regions = new Set<string>();
  for (const v of cells) {
    const rv = rects.get(v.id)!;
    if (isSequenceLifeline(v.style) || isFragmentFrame(v.style, rv.w, rv.h)) {
      regions.add(v.id);
      continue;
    }
    for (const u of cells) {
      if (u.id === v.id) continue;
      const ru = rects.get(u.id)!;
      if (ru.w <= 0 && ru.h <= 0) continue;
      if (fullyContains(rv, ru)) { regions.add(v.id); break; }
    }
  }
  return regions;
}

/** Edges whose polyline passes through an unrelated content node. */
export function edgeNodeCrossings(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const lines = polylineCache(graph, rects);
  const regions = regionIds(graph, rects);
  const issues: LayoutIssue[] = [];
  for (const edge of allEdges(graph)) {
    const line = lines.get(edge.id);
    if (!line || line.length < 2) continue;
    for (const node of graph.nodes) {
      if (node.id === edge.sourceId || node.id === edge.targetId) continue;
      // Bands/regions and nodes fully containing an endpoint are backgrounds —
      // an edge leaving/entering or passing over them is visually legitimate
      if (regions.has(node.id)) continue;
      const srcRect = edge.sourceId ? rects.get(edge.sourceId) : undefined;
      const tgtRect = edge.targetId ? rects.get(edge.targetId) : undefined;
      const victimRect = rects.get(node.id)!;
      if ((srcRect && fullyContains(victimRect, srcRect))
        || (tgtRect && fullyContains(victimRect, tgtRect))) continue;
      if (polylineHitsRect(line, victimRect)) {
        issues.push({
          type: 'edge_crossing', severity: 'high',
          edge_id: edge.id, edge_source: edge.sourceId, edge_target: edge.targetId,
          crosses_node: node.id,
          fix_hint: `Edge '${edge.id}' (${edge.sourceId}→${edge.targetId}) cuts through '${node.id}'.`,
        });
      }
    }
  }
  return issues;
}

/** Crossing edges (no shared endpoint) and stacked parallel edges. */
export function edgeEdgeCrossings(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const lines = polylineCache(graph, rects);
  const edges = allEdges(graph);
  const regions = regionRects(graph, rects);
  const issues: LayoutIssue[] = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i], b = edges[j];
      // Shared endpoint: fan-out is normal — only flag if the routes coincide
      // (e.g. duplicate request/response edges rendered on the same line)
      if (sharesEndpoint(a, b)) {
        if (segmentsCross(lines.get(a.id), lines.get(b.id))) pushStacked(issues, a, b);
        continue;
      }
      const at = firstCrossPoint(lines.get(a.id) ?? [], lines.get(b.id) ?? []);
      // Crossings over lifelines/bands (e.g. a self-message tick on a lifeline)
      // are normal sequence-diagram rendering — only flag mid-air crossings
      if (at && !insideAnyRect(at, regions)) {
        issues.push({
          type: 'edge_edge_crossing', severity: 'medium',
          edge_a: a.id, edge_b: b.id,
          fix_hint: `Edges '${a.id}' and '${b.id}' intersect — add waypoints to one.`,
        });
      }
    }
  }
  return issues;
}

/**
 * Edges passing over a container that is unrelated to both endpoints.
 * Severity LOW: containers/bands render as backgrounds in draw.io — edges
 * over them are normal; defects on the contained content are caught separately.
 */
export function edgeContainerCrossings(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const byId = cellIndex(graph);
  const lines = polylineCache(graph, rects);
  const issues: LayoutIssue[] = [];
  for (const edge of allEdges(graph)) {
    const line = lines.get(edge.id);
    if (!line || line.length < 2) continue;
    // Containers owning either endpoint are legitimately entered by the edge
    const related = union(ancestorsOf(edge.sourceId, byId), ancestorsOf(edge.targetId, byId));
    for (const container of graph.containers) {
      if (container.id === edge.sourceId || container.id === edge.targetId) continue;
      if (related.has(container.id)) continue;
      if (polylineHitsRect(line, rects.get(container.id)!)) {
        issues.push({
          type: 'edge_container_crossing', severity: 'low',
          edge_id: edge.id, edge_source: edge.sourceId, edge_target: edge.targetId,
          crosses_container: container.id,
          fix_hint: `Edge '${edge.id}' passes over container '${container.id}'.`,
        });
      }
    }
  }
  return issues;
}

function polylineCache(graph: DiagramGraph, rects: Map<string, Rect>): Map<string, Point[]> {
  const byId = cellIndex(graph);
  const originOf = (parentId: string): Point => {
    const r = rects.get(parentId);
    return r ? { x: r.x, y: r.y } : { x: 0, y: 0 };
  };
  const lines = new Map<string, Point[]>();
  for (const e of allEdges(graph)) {
    // Anchored edges need both endpoints resolvable; loose edges only points
    const anchored = Boolean(e.sourceId && e.targetId);
    if (anchored && (!byId.has(e.sourceId) || !byId.has(e.targetId))) continue;
    lines.set(e.id, edgePolyline(e, rects, originOf));
  }
  return lines;
}

/** Rects of all background regions (for crossing-point checks). */
function regionRects(graph: DiagramGraph, rects: Map<string, Rect>): Rect[] {
  const ids = regionIds(graph, rects);
  return [...ids].map(id => rects.get(id)!).filter(Boolean);
}

function insideAnyRect(p: Point, rects: Rect[]): boolean {
  return rects.some(r => p.x >= r.x - EDGE_MARGIN && p.x <= r.x + r.w + EDGE_MARGIN
    && p.y >= r.y - EDGE_MARGIN && p.y <= r.y + r.h + EDGE_MARGIN);
}

function polylineHitsRect(line: Point[], rect: Rect): boolean {
  return line.some((p, i) => i > 0 && segIntersectsRect(line[i - 1], p, rect, EDGE_MARGIN));
}

function segmentsCross(a: Point[] | undefined, b: Point[] | undefined): boolean {
  if (!a || !b || a.length < 2 || b.length < 2) return false;
  for (let i = 1; i < a.length; i++) {
    for (let k = 1; k < b.length; k++) {
      if (segsCross(a[i - 1], a[i], b[k - 1], b[k])) return true;
    }
  }
  return false;
}

/** Two edges sharing a non-empty source or target. */
function sharesEndpoint(a: { sourceId: string; targetId: string }, b: { sourceId: string; targetId: string }): boolean {
  const pair = (x: string, y: string): boolean => x !== '' && x === y;
  return pair(a.sourceId, b.sourceId) || pair(a.targetId, b.targetId)
    || pair(a.sourceId, b.targetId) || pair(a.targetId, b.sourceId);
}

function pushStacked(issues: LayoutIssue[], a: { id: string; sourceId: string; targetId: string }, b: { id: string }): void {
  issues.push({
    type: 'stacked_edges', severity: 'medium',
    edge_a: a.id, edge_b: b.id,
    fix_hint: `Edges '${a.id}' and '${b.id}' (${a.sourceId}→${a.targetId}) overlap; spread their ports.`,
  });
}

function union(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set(a);
  for (const v of b) out.add(v);
  return out;
}
