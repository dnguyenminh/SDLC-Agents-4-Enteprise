/**
 * Shared helpers of the edge detectors: edge lists, background regions,
 * absolute polylines and polyline-vs-rect / edge-vs-edge tests.
 */

import type { DiagramGraph, DiagramEdge } from './drawio-parser';
import { cellIndex, fullyContains, segIntersectsRect, segsCross } from './drawio-geometry';
import type { Point, Rect } from './drawio-geometry';
import { edgePolyline } from './drawio-polyline';
import { isFragmentFrame, isSequenceLifeline } from './drawio-style';

/** Tolerance (px) around shapes for crossing tests. */
const EDGE_MARGIN = 4;

/** Anchored edges plus loose point-only edges, in one iteration list. */
export function allEdges(graph: DiagramGraph): DiagramEdge[] {
  return [...graph.edges, ...(graph.looseEdges ?? [])];
}

/**
 * Cells that act as background regions: they fully contain at least one other
 * cell, they are UML lifelines, or they are large dashed fragment frames.
 * Edges legitimately pass over them; actual visual defects are caught on the
 * CONTENT cells inside instead.
 */
export function regionIds(graph: DiagramGraph, rects: Map<string, Rect>): Set<string> {
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

export function polylineCache(graph: DiagramGraph, rects: Map<string, Rect>): Map<string, Point[]> {
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
export function regionRects(graph: DiagramGraph, rects: Map<string, Rect>): Rect[] {
  const ids = regionIds(graph, rects);
  return [...ids].map(id => rects.get(id)!).filter(Boolean);
}

export function insideAnyRect(p: Point, rects: Rect[]): boolean {
  return rects.some(r => p.x >= r.x - EDGE_MARGIN && p.x <= r.x + r.w + EDGE_MARGIN
    && p.y >= r.y - EDGE_MARGIN && p.y <= r.y + r.h + EDGE_MARGIN);
}

export function polylineHitsRect(line: Point[], rect: Rect): boolean {
  return line.some((p, i) => i > 0 && segIntersectsRect(line[i - 1], p, rect, EDGE_MARGIN));
}

export function segmentsCross(a: Point[] | undefined, b: Point[] | undefined): boolean {
  if (!a || !b || a.length < 2 || b.length < 2) return false;
  for (let i = 1; i < a.length; i++) {
    for (let k = 1; k < b.length; k++) {
      if (segsCross(a[i - 1], a[i], b[k - 1], b[k])) return true;
    }
  }
  return false;
}

/** Two edges sharing a non-empty source or target. */
export function sharesEndpoint(a: { sourceId: string; targetId: string }, b: { sourceId: string; targetId: string }): boolean {
  const pair = (x: string, y: string): boolean => x !== '' && x === y;
  return pair(a.sourceId, b.sourceId) || pair(a.targetId, b.targetId)
    || pair(a.sourceId, b.targetId) || pair(a.targetId, b.sourceId);
}

export function union(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set(a);
  for (const v of b) out.add(v);
  return out;
}
