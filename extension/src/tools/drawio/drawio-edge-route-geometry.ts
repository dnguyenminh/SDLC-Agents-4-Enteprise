/**
 * SA4E-406 — geometry helpers shared by edge-route candidate planning.
 * Kept separate from the public edge-plan facade so each module stays small.
 */

import type { DiagramEdge, DiagramGraph } from './drawio-parser';
import { absoluteRects, ancestorsOf, cellIndex } from './drawio-geometry';
import type { Point, Rect } from './drawio-geometry';
import { GridRouter, type Dir, type RouteJob } from './drawio-grid-router';
import { stubLength, stubOf } from './drawio-edge-stub';
import type { EdgePorts, PortAssignment } from './drawio-edge-ports';
import type { EdgePlan } from './drawio-edge-plan';

export interface PlanContext {
  graph: DiagramGraph;
  rects: Map<string, Rect>;
  byId: ReturnType<typeof cellIndex>;
  edges: DiagramEdge[];
}

export interface Endpoints {
  job: RouteJob;
  portS: Point;
  portT: Point;
  edge: DiagramEdge;
  ports: EdgePorts;
}

/** Build the routing context for all connected, non-hierarchical edges. */
export function buildPlanContext(graph: DiagramGraph): PlanContext {
  const rects = absoluteRects(graph);
  const byId = cellIndex(graph);
  const edges = graph.edges.filter(e => routable(e, byId, rects));
  return { graph, rects, byId, edges };
}

/** Both ends exist, differ, and are not in an ancestor/descendant relation. */
function routable(e: DiagramEdge, byId: ReturnType<typeof cellIndex>, rects: Map<string, Rect>): boolean {
  if (!e.sourceId || !e.targetId || e.sourceId === e.targetId) return false;
  if (!rects.has(e.sourceId) || !rects.has(e.targetId)) return false;
  return !ancestorsOf(e.sourceId, byId).has(e.targetId) && !ancestorsOf(e.targetId, byId).has(e.sourceId);
}

/** Lowest common container of both ends ('1' when only the root is shared). */
export function parentOf(e: DiagramEdge, byId: ReturnType<typeof cellIndex>): string {
  const srcChain = ancestorsOf(e.sourceId, byId);
  for (const id of orderedAncestors(e.targetId, byId)) if (srcChain.has(id)) return id;
  return '1';
}

/** Ancestor ids from the immediate parent towards the root. */
export function orderedAncestors(id: string, byId: ReturnType<typeof cellIndex>): string[] {
  const out: string[] = [];
  for (let cur = byId.get(id)?.parentId; cur && byId.has(cur) && !out.includes(cur); cur = byId.get(cur)?.parentId) out.push(cur);
  return out;
}

/** Containers an edge may run inside without penalty. */
export function relatedContainers(e: DiagramEdge, byId: ReturnType<typeof cellIndex>): Set<string> {
  return new Set([e.sourceId, e.targetId, ...ancestorsOf(e.sourceId, byId), ...ancestorsOf(e.targetId, byId)]);
}

/** Port points (absolute) and the stub jobs for the router. */
export function endpoints(
  edge: DiagramEdge, rects: Map<string, Rect>, ports: EdgePorts,
  related: Set<string>, obstacles: Rect[],
): Endpoints {
  const portS = portPoint(rects.get(edge.sourceId)!, ports.exit);
  const portT = portPoint(rects.get(edge.targetId)!, ports.entry);
  const job: RouteJob = {
    start: stubOf(portS, ports.exit.side, stubLength(portS, ports.exit.side, rects.get(edge.sourceId)!, obstacles)),
    end: stubOf(portT, ports.entry.side, stubLength(portT, ports.entry.side, rects.get(edge.targetId)!, obstacles)),
    startDir: ports.exit.side, endDir: ports.entry.side, related,
  };
  return { job, portS, portT, edge, ports };
}

/** Absolute point on the side of `r`: constant on the side axis, `frac` along it. */
function portPoint(r: Rect, a: PortAssignment): Point {
  switch (a.side) {
    case 0: return { x: r.x + r.w, y: round2(r.y + a.frac * r.h) };
    case 2: return { x: r.x, y: round2(r.y + a.frac * r.h) };
    case 1: return { x: round2(r.x + a.frac * r.w), y: r.y + r.h };
    default: return { x: round2(r.x + a.frac * r.w), y: r.y };
  }
}

/** Manhattan span of a router job. */
export function span(j: RouteJob): number {
  return Math.abs(j.start.x - j.end.x) + Math.abs(j.start.y - j.end.y);
}

/** Route one edge; fall back to a plain elbow when the grid has no path. */
export function toPlan(t: Endpoints, router: GridRouter, rects: Map<string, Rect>, parentId: string): EdgePlan {
  const gridRoute = router.route(t.job);
  const corners = gridRoute ?? elbow(t.job);
  const full = dropCollinear([t.portS, ...corners, t.portT]);
  const path = full.slice(1, -1);
  const origin = parentId === '1' ? { x: 0, y: 0 } : rects.get(parentId) ?? { x: 0, y: 0 };
  return {
    id: t.edge.id, parentId,
    exit: fraction(rects.get(t.edge.sourceId)!, t.portS), entry: fraction(rects.get(t.edge.targetId)!, t.portT),
    waypoints: path.map(p => ({ x: round2(p.x - origin.x), y: round2(p.y - origin.y) })),
    polyline: full, exitSide: t.ports.exit.side, entrySide: t.ports.entry.side, fallback: gridRoute === null,
  };
}

/** Axis-aligned two-segment connector between stubs. */
function elbow(job: RouteJob): Point[] {
  const horizontalFirst = job.startDir % 2 === 0;
  const mid = horizontalFirst ? { x: job.end.x, y: job.start.y } : { x: job.start.x, y: job.end.y };
  return [job.start, mid, job.end];
}

function dropCollinear(points: Point[]): Point[] {
  return points.filter((p, i) => {
    if (i === 0 || i === points.length - 1) return true;
    const a = points[i - 1], b = points[i + 1];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}

/** Anchor fractions of an absolute port point within its node rect. */
function fraction(r: Rect, p: Point): Point {
  return { x: round2((p.x - r.x) / r.w), y: round2((p.y - r.y) / r.h) };
}

function round2(v: number): number { return Math.round(v * 100) / 100; }

/** Re-export for callers that only need the direction type. */
export type { Dir };
