/**
 * SA4E-406 — fresh edge routing after a relayout.
 *
 * LLM-authored edges carry waypoints, terminal hints and a `parent` that all
 * belong to the OLD positions. After nodes move, none of it is valid, so every
 * connected edge is re-planned from the NEW geometry:
 *   1. parent  = lowest common container of its two ends (root for cross-band
 *                edges) — waypoints are stored relative to the parent origin;
 *   2. ports   = facing sides, spread along each side (drawio-edge-ports);
 *   3. route   = orthogonal A* around every node (drawio-grid-router);
 *   4. write   = parent, exit/entry anchors, waypoints; stale hints dropped.
 */

import type { DiagramEdge, DiagramGraph } from './drawio-parser';
import { absoluteRects, ancestorsOf, cellIndex } from './drawio-geometry';
import type { Point, Rect } from './drawio-geometry';
import { GridRouter, type Dir, type RouteJob } from './drawio-grid-router';
import { stubLength, stubOf } from './drawio-edge-stub';
import { assignPorts, type EdgePorts, type PortAssignment } from './drawio-edge-ports';
import { countCrossings, lateralHints } from './drawio-edge-quality';
import { planSelfLoops } from './drawio-edge-loops';
import { clearEdgeTerminalPoints, setCellParent, setEdgePointsXml, upsertEdgeStyleKeys } from './drawio-xml-utils';

/** Distance (px) the edge leaves a node perpendicular to its side before turning. */
const STUB = 20;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

export interface EdgePlan {
  id: string;
  /** Container the edge lives in ('1' = root). Waypoints are relative to it. */
  parentId: string;
  exit: Point;
  entry: Point;
  waypoints: Point[];
  /** Absolute route incl. both ports, and the node sides used (for refinement). */
  polyline: Point[];
  exitSide: Dir;
  entrySide: Dir;
  /** True when the grid router found no path and a plain elbow was used instead. */
  fallback?: boolean;
}

interface Endpoints { job: RouteJob; portS: Point; portT: Point; edge: DiagramEdge; ports: EdgePorts; }

/** Edge counts above this skip the second (refinement) routing pass. */
const MAX_REFINE_EDGES = 120;

interface PlanContext {
  graph: DiagramGraph;
  rects: Map<string, Rect>;
  byId: ReturnType<typeof cellIndex>;
  edges: DiagramEdge[];
}

/**
 * Plan fresh routes for every connected, routable edge of the graph.
 * Port order is first chosen from where the far ends lie; after routing, the
 * ports are reordered by the direction each edge REALLY turns (routes detour
 * around obstacles) and the graph is routed again — the plan with fewer
 * crossings wins.
 */
export function planEdges(graph: DiagramGraph): EdgePlan[] {
  const rects = absoluteRects(graph);
  const byId = cellIndex(graph);
  const ctx: PlanContext = { graph, rects, byId, edges: graph.edges.filter(e => routable(e, byId, rects)) };
  const loops = planSelfLoops(graph.edges, rects, id => orderedAncestors(id, byId)[0] ?? '1');
  const first = planPass(ctx);
  if (ctx.edges.length < 2 || ctx.edges.length > MAX_REFINE_EDGES) return [...first, ...loops];
  const second = planPass(ctx, lateralHints(first));
  const crossings = (plans: EdgePlan[]): number => countCrossings(plans.map(p => p.polyline));
  return [...(crossings(second) < crossings(first) ? second : first), ...loops];
}

/** One assign-ports + route pass; `hints` override far-end port ordering. */
function planPass(ctx: PlanContext, hints?: Map<string, number>): EdgePlan[] {
  const { graph, rects, byId, edges } = ctx;
  const ports = assignPorts(edges, byId, rects, hints);
  const obstacles = graph.nodes.map(n => rects.get(n.id)!);
  const targets = edges.map(e => endpoints(e, rects, ports.get(e.id)!, relatedContainers(e, byId), obstacles));
  const zones = graph.containers.map(c => ({ id: c.id, rect: rects.get(c.id)! }));
  const router = new GridRouter(obstacles, targets.flatMap(t => [t.job.start, t.job.end]), zones);
  const byLength = [...targets].sort((a, b) => span(a.job) - span(b.job));
  return byLength.map(t => toPlan(t, router, rects, parentOf(t.edge, byId)));
}
/** Write plans into the XML (parent, anchors, waypoints; stale hints removed). */
export function applyEdgePlans(xml: string, plans: EdgePlan[]): string {
  let out = xml;
  for (const p of plans) {
    out = setCellParent(out, p.id, p.parentId);
    out = clearEdgeTerminalPoints(out, p.id);
    out = setEdgePointsXml(out, p.id, p.waypoints);
    // The planned route only survives if draw.io honours waypoints. Styles such as
    // entityRelationEdgeStyle / elbowEdgeStyle re-route the edge themselves (diagonals
    // across other shapes) and curved=1 bends the corners, so force orthogonal.
    out = upsertEdgeStyleKeys(out, p.id, {
      edgeStyle: 'orthogonalEdgeStyle', curved: 0,
      exitX: p.exit.x, exitY: p.exit.y, entryX: p.entry.x, entryY: p.entry.y,
    });
  }
  return out;
}

/** Both ends exist, differ, and are not in an ancestor/descendant relation. */
function routable(e: DiagramEdge, byId: ReturnType<typeof cellIndex>, rects: Map<string, Rect>): boolean {
  if (!e.sourceId || !e.targetId || e.sourceId === e.targetId) return false;
  if (!rects.has(e.sourceId) || !rects.has(e.targetId)) return false;
  return !ancestorsOf(e.sourceId, byId).has(e.targetId) && !ancestorsOf(e.targetId, byId).has(e.sourceId);
}

/** Lowest common container of both ends ('1' when only the root is shared). */
function parentOf(e: DiagramEdge, byId: ReturnType<typeof cellIndex>): string {
  const srcChain = ancestorsOf(e.sourceId, byId);
  for (const id of orderedAncestors(e.targetId, byId)) if (srcChain.has(id)) return id;
  return '1';
}

function orderedAncestors(id: string, byId: ReturnType<typeof cellIndex>): string[] {
  const out: string[] = [];
  for (let cur = byId.get(id)?.parentId; cur && byId.has(cur) && !out.includes(cur); cur = byId.get(cur)?.parentId) out.push(cur);
  return out;
}

/** Containers an edge may run inside without penalty: its ends and everything enclosing them. */
function relatedContainers(e: DiagramEdge, byId: ReturnType<typeof cellIndex>): Set<string> {
  return new Set([e.sourceId, e.targetId, ...ancestorsOf(e.sourceId, byId), ...ancestorsOf(e.targetId, byId)]);
}

/** Port points (absolute) and the stub jobs for the router. */
function endpoints(edge: DiagramEdge, rects: Map<string, Rect>, ports: EdgePorts, related: Set<string>, obstacles: Rect[]): Endpoints {
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

function span(j: RouteJob): number {
  return Math.abs(j.start.x - j.end.x) + Math.abs(j.start.y - j.end.y);
}

/** Route one edge; if the grid has no path fall back to a plain elbow (still orthogonal). */
function toPlan(t: Endpoints, router: GridRouter, rects: Map<string, Rect>, parentId: string): EdgePlan {
  const gridRoute = router.route(t.job);
  const corners = gridRoute ?? elbow(t.job);
  const full = dropCollinear([t.portS, ...corners, t.portT]);
  const path = full.slice(1, -1);
  const o = parentId === '1' ? { x: 0, y: 0 } : rects.get(parentId) ?? { x: 0, y: 0 };
  return {
    id: t.edge.id, parentId,
    exit: fraction(rects.get(t.edge.sourceId)!, t.portS), entry: fraction(rects.get(t.edge.targetId)!, t.portT),
    waypoints: path.map(p => ({ x: round2(p.x - o.x), y: round2(p.y - o.y) })),
    polyline: full, exitSide: t.ports.exit.side, entrySide: t.ports.entry.side, fallback: gridRoute === null,
  };
}

/** Axis-aligned two-segment connector between stubs (router fallback). */
function elbow(job: RouteJob): Point[] {
  const horizontalFirst = job.startDir % 2 === 0;
  const mid = horizontalFirst ? { x: job.end.x, y: job.start.y } : { x: job.start.x, y: job.end.y };
  return [job.start, mid, job.end];
}

function dropCollinear(pts: Point[]): Point[] {
  return pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const a = pts[i - 1], b = pts[i + 1];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}

/** Anchor fractions of an absolute port point within its node rect. */
function fraction(r: Rect, p: Point): Point {
  return { x: round2((p.x - r.x) / r.w), y: round2((p.y - r.y) / r.h) };
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
