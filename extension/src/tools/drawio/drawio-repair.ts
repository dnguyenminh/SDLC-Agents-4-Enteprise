/**
 * Local repair planner — minimal, targeted fixes for detected layout issues:
 * push apart overlapping/too-close nodes, clamp children back into containers,
 * reroute edges that cut through shapes. Preserves the overall layout.
 */

import type { DiagramGraph } from './drawio-parser';
import { absoluteRects, cellIndex } from './drawio-geometry';
import type { Point, Rect } from './drawio-geometry';
import { computeRoute } from './drawio-router';
import { detectThresholds, type LayoutIssue } from './drawio-detect';
import { addShift, curRect, type Ctx } from './drawio-repair-ctx';
import { rerouteEdges } from './drawio-repair-routes';

export interface RepairPlan {
  /** New parent-relative positions for moved cells. */
  moves: Map<string, Point>;
  /** Enlarged container sizes (origin unchanged). */
  resizes: Map<string, { w: number; h: number }>;
  /** Edge id → waypoints in edge-parent space. */
  routes: Map<string, Point[]>;
}

const PUSH_PASSES = 3;   // let cascaded pushes settle
const CONTAIN_MARGIN = 10; // padding kept between a child and its container
const STACK_OFFSET = 24;   // perpendicular offset for stacked parallel edges

/** Plan minimal repairs for the given issues. Returns an empty plan when nothing is actionable. */
export function planLocalRepair(graph: DiagramGraph, issues: LayoutIssue[], spacing: number): RepairPlan {
  const ctx: Ctx = {
    byId: cellIndex(graph),
    rects: absoluteRects(graph),
    shift: new Map(),
    resizes: new Map(),
    spacing,
  };
  pushApart(ctx, collectPairs(issues));
  containChildren(ctx, issues);
  const routes = rerouteEdges(ctx, graph, issues);
  return buildPlan(ctx, routes);
}

/** Unique node pairs to separate, tagged with the issue kind. */
function collectPairs(issues: LayoutIssue[]): Array<{ a: string; b: string; kind: 'overlap' | 'proximity' }> {
  const seen = new Set<string>();
  const pairs: Array<{ a: string; b: string; kind: 'overlap' | 'proximity' }> = [];
  for (const issue of issues) {
    const kind = issue.type === 'node_overlap' ? 'overlap'
      : issue.type === 'node_proximity' ? 'proximity' : null;
    if (!kind) continue;
    const a = String(issue.node_a), b = String(issue.node_b);
    const key = kind + [a, b].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ a, b, kind });
  }
  return pairs;
}

/** Iteratively push violating pairs apart until the required gap is met. */
function pushApart(ctx: Ctx, pairs: Array<{ a: string; b: string; kind: 'overlap' | 'proximity' }>): void {
  for (let pass = 0; pass < PUSH_PASSES; pass++) {
    for (const pair of pairs) {
      const ra = curRect(ctx, pair.a), rb = curRect(ctx, pair.b);
      const required = pair.kind === 'overlap'
        ? Math.max(ctx.spacing * 0.5, detectThresholds().gap)
        : detectThresholds().gap;
      const { da, db } = separationDelta(ra, rb, required);
      if (da.x === 0 && da.y === 0) continue;
      addShift(ctx.shift, pair.a, da);
      addShift(ctx.shift, pair.b, db);
    }
  }
}

/** Pure: translation for each rect so border gap becomes >= required. */
function separationDelta(ra: Rect, rb: Rect, required: number): { da: Point; db: Point } {
  const overlapX = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
  const overlapY = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
  if (overlapX > 0 && overlapY > 0) return pushOut(ra, rb, overlapX, overlapY, required);
  const sepX = Math.max(ra.x - (rb.x + rb.w), rb.x - (ra.x + ra.w));
  const sepY = Math.max(ra.y - (rb.y + rb.h), rb.y - (ra.y + ra.h));
  const gap = Math.max(sepX, sepY);
  if (gap < 0 || gap >= required) return { da: { x: 0, y: 0 }, db: { x: 0, y: 0 } };
  return pushCloser(ra, rb, sepX >= sepY ? 'x' : 'y', gap, required);
}

/** Overlapping rects: split the needed separation along the thinner axis. */
function pushOut(ra: Rect, rb: Rect, overlapX: number, overlapY: number, required: number): { da: Point; db: Point } {
  const alongX = overlapX <= overlapY;
  const total = (alongX ? overlapX : overlapY) + required;
  const aFirst = alongX ? ra.x + ra.w / 2 <= rb.x + rb.w / 2 : ra.y + ra.h / 2 <= rb.y + rb.h / 2;
  const sign = aFirst ? -1 : 1;
  const half = total / 2;
  return {
    da: alongX ? { x: sign * half, y: 0 } : { x: 0, y: sign * half },
    db: alongX ? { x: -sign * half, y: 0 } : { x: 0, y: -sign * half },
  };
}

/** Separated but too close: nudge both along the separating axis. */
function pushCloser(ra: Rect, rb: Rect, axis: 'x' | 'y', gap: number, required: number): { da: Point; db: Point } {
  const need = (required - gap) / 2;
  const aLeft = axis === 'x' ? ra.x <= rb.x : ra.y <= rb.y;
  const sign = aLeft ? -1 : 1;
  return {
    da: axis === 'x' ? { x: sign * need, y: 0 } : { x: 0, y: sign * need },
    db: axis === 'x' ? { x: -sign * need, y: 0 } : { x: 0, y: -sign * need },
  };
}

/** Clamp children back inside their containers; grow containers that are too small. */
function containChildren(ctx: Ctx, issues: LayoutIssue[]): void {
  for (const issue of issues) {
    if (issue.type !== 'child_outside_container') continue;
    const child = String(issue.child), container = String(issue.container);
    const rc = curRect(ctx, child), rp = curRect(ctx, container);
    const needW = rc.w + 2 * CONTAIN_MARGIN, needH = rc.h + 2 * CONTAIN_MARGIN;
    if (needW > rp.w || needH > rp.h) {
      ctx.resizes.set(container, { w: Math.max(rp.w, needW), h: Math.max(rp.h, needH) });
    }
    const grown = curRect(ctx, container);
    const dx = clampTo(rc.x, grown.x + CONTAIN_MARGIN, grown.x + grown.w - rc.w - CONTAIN_MARGIN) - rc.x;
    const dy = clampTo(rc.y, grown.y + CONTAIN_MARGIN, grown.y + grown.h - rc.h - CONTAIN_MARGIN) - rc.y;
    if (dx !== 0 || dy !== 0) addShift(ctx.shift, child, { x: dx, y: dy });
  }
}

/** Finalize: accumulated absolute deltas → parent-relative positions. */
function buildPlan(ctx: Ctx, routes: Map<string, Point[]>): RepairPlan {
  const moves = new Map<string, Point>();
  for (const [id, s] of ctx.shift) {
    if (s.x === 0 && s.y === 0) continue;
    const cell = ctx.byId.get(id);
    if (!cell) continue;
    const ps = ctx.shift.get(cell.parentId) ?? { x: 0, y: 0 };
    moves.set(id, { x: cell.x + s.x - ps.x, y: cell.y + s.y - ps.y });
  }
  return { moves, resizes: ctx.resizes, routes };
}

function clampTo(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
