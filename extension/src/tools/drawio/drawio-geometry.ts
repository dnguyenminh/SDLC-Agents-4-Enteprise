/**
 * Geometry primitives for draw.io layout analysis — absolute rects, rect math,
 * segment/rect intersection, and edge polyline reconstruction.
 *
 * draw.io stores child geometry relative to the parent cell origin, so all
 * cross-cell comparisons (overlap, crossing) must use absolute coordinates.
 */

import type { DiagramGraph, DiagramNode, DiagramEdge } from './drawio-parser';

export interface Rect { x: number; y: number; w: number; h: number; }
export interface Point { x: number; y: number; }

/** Map every vertex/container id to its absolute rect (parent offsets applied). */
export function absoluteRects(graph: DiagramGraph): Map<string, Rect> {
  const byId = new Map<string, DiagramNode>();
  for (const n of [...graph.nodes, ...graph.containers]) byId.set(n.id, n);
  const abs = new Map<string, Rect>();
  const inProgress = new Set<string>();
  const resolve = (id: string): Rect => {
    const memo = abs.get(id);
    if (memo) return memo;
    const node = byId.get(id);
    if (!node) return { x: 0, y: 0, w: 0, h: 0 };
    // Guard against malformed cyclic parent chains
    if (inProgress.has(id)) return { x: node.x, y: node.y, w: node.width, h: node.height };
    inProgress.add(id);
    const parent = node.parentId && node.parentId !== '0' && node.parentId !== '1'
      ? resolve(node.parentId) : { x: 0, y: 0, w: 0, h: 0 };
    inProgress.delete(id);
    const rect = { x: node.x + parent.x, y: node.y + parent.y, w: node.width, h: node.height };
    abs.set(id, rect);
    return rect;
  };
  for (const id of byId.keys()) resolve(id);
  return abs;
}

/** Strict ancestor ids of a cell (excluding itself), per parsed parent links. */
export function ancestorsOf(id: string, byId: Map<string, DiagramNode>): Set<string> {
  const out = new Set<string>();
  let cur = byId.get(id)?.parentId;
  while (cur && cur !== '0' && cur !== '1' && !out.has(cur)) {
    out.add(cur);
    cur = byId.get(cur)?.parentId;
  }
  return out;
}

/** Map of all vertices + containers by id (for parent-chain walks). */
export function cellIndex(graph: DiagramGraph): Map<string, DiagramNode> {
  return new Map([...graph.nodes, ...graph.containers].map(n => [n.id, n]));
}

/** Overlap area as a fraction of the smaller rect (0 = disjoint). */
export function overlapRatio(a: Rect, b: Rect): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ox <= 0 || oy <= 0) return 0;
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller > 0 ? (ox * oy) / smaller : 0;
}

/** True when `inner` lies entirely inside `outer` (within eps px). */
export function fullyContains(outer: Rect, inner: Rect, eps = 4): boolean {
  return inner.x >= outer.x - eps && inner.y >= outer.y - eps
    && inner.x + inner.w <= outer.x + outer.w + eps
    && inner.y + inner.h <= outer.y + outer.h + eps;
}

/** Border-to-border separation: positive gap, or negative when overlapping. */
export function rectGap(a: Rect, b: Rect): number {
  const sepX = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const sepY = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  return Math.max(sepX, sepY);
}

/** Segment vs rect intersection (Liang-Barsky); endpoint inside counts as hit. */
export function segIntersectsRect(p1: Point, p2: Point, r: Rect, margin: number): boolean {
  const xmin = r.x - margin, xmax = r.x + r.w + margin;
  const ymin = r.y - margin, ymax = r.y + r.h + margin;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  let t0 = 0, t1 = 1;
  const clips: Array<[number, number]> = [
    [-dx, p1.x - xmin], [dx, xmax - p1.x],
    [-dy, p1.y - ymin], [dy, ymax - p1.y],
  ];
  for (const [p, q] of clips) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; t0 = Math.max(t0, t); }
    else { if (t < t0) return false; t1 = Math.min(t1, t); }
  }
  return t0 <= t1;
}

/** Proper segment-segment crossing (collinear overlap counts, shared ends do not). */
export function segsCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = cross(b1, b2, a1), d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1), d4 = cross(a1, a2, b2);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  // Collinear overlap: needs an endpoint strictly inside the other segment,
  // or two identical segments (both endpoints shared)
  if (d1 === 0 && (strictlyOn(b1, b2, a1) || identicalSeg(a1, a2, b1, b2))) return true;
  if (d2 === 0 && strictlyOn(b1, b2, a2)) return true;
  if (d3 === 0 && strictlyOn(a1, a2, b1)) return true;
  if (d4 === 0 && strictlyOn(a1, a2, b2)) return true;
  return false;
}

function strictlyOn(a: Point, b1: Point, b2: Point): boolean {
  return onSegment(b1, b2, a) && !samePoint(a, b1) && !samePoint(a, b2);
}

function identicalSeg(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  return (samePoint(a1, b1) && samePoint(a2, b2)) || (samePoint(a1, b2) && samePoint(a2, b1));
}

function samePoint(p: Point, q: Point): boolean {
  return p.x === q.x && p.y === q.y;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x)
    && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
}

/** Perimeter point of a rect on the ray from its center towards a target point. */
export function perimeterTowards(r: Rect, towards: Point): Point {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dx = towards.x - cx, dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  // Smallest positive scale t that puts center + t*d on the rect boundary
  const tx = dx !== 0 ? (r.w / 2) / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const ty = dy !== 0 ? (r.h / 2) / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

/** First intersection point between two polylines, or null. */
export function firstCrossPoint(a: Point[], b: Point[]): Point | null {
  if (a.length < 2 || b.length < 2) return null;
  for (let i = 1; i < a.length; i++) {
    for (let k = 1; k < b.length; k++) {
      if (segsCross(a[i - 1], a[i], b[k - 1], b[k])) {
        return segIntersectionPoint(a[i - 1], a[i], b[k - 1], b[k]);
      }
    }
  }
  return null;
}

/** Intersection point of two crossing segments (midpoint fallback for collinear). */
export function segIntersectionPoint(p1: Point, p2: Point, p3: Point, p4: Point): Point {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (d === 0) {
    // Collinear overlap: approximate with the midpoint of segment 1
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}
