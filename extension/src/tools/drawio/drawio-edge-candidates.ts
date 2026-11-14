/**
 * SA4E-406 — route candidate selection for the edge planner.
 * Tries short/long commit orders and a port-refinement pass, then keeps the
 * plan with the fewest conflicts, fallbacks and total route length.
 */

import type { EdgePlan } from './drawio-edge-plan';
import { assignPorts, type PortSideOverrides } from './drawio-edge-ports';
import { countCrossings, lateralHints } from './drawio-edge-quality';
import { GridRouter } from './drawio-grid-router';
import type { Point } from './drawio-geometry';
import {
  endpoints, parentOf, relatedContainers, span, toPlan,
  type PlanContext,
} from './drawio-edge-route-geometry';

type RouteOrder = 'short' | 'long';

/** Edge counts above this skip the port-refinement pass. */
const MAX_REFINE_EDGES = 120;

/** Best route across route orders and the port-refinement pass. */
export function planCandidate(
  ctx: PlanContext, loops: EdgePlan[], overrides?: PortSideOverrides,
): EdgePlan[] {
  const orders: RouteOrder[] = ['short', 'long'];
  const firsts = orders.map(order => planPass(ctx, undefined, loops, order, overrides));
  let best = bestPlan(firsts, loops);
  if (ctx.edges.length < 2 || ctx.edges.length > MAX_REFINE_EDGES) return best;
  const hints = lateralHints(best);
  const seconds = orders.map(order => planPass(ctx, hints, loops, order, overrides));
  return bestPlan([best, ...seconds], loops);
}

/** One assign-ports + route pass. */
function planPass(
  ctx: PlanContext, hints: Map<string, number> | undefined, reserved: EdgePlan[],
  order: RouteOrder, overrides?: PortSideOverrides,
): EdgePlan[] {
  const ports = assignPorts(ctx.edges, ctx.byId, ctx.rects, hints, overrides);
  const obstacles = ctx.graph.nodes.map(n => ctx.rects.get(n.id)!);
  const targets = ctx.edges.map(e => endpoints(
    e, ctx.rects, ports.get(e.id)!, relatedContainers(e, ctx.byId), obstacles,
  ));
  const router = buildRouter(ctx, targets.flatMap(t => [t.job.start, t.job.end]), reserved);
  const ordered = [...targets].sort((a, b) => order === 'short'
    ? span(a.job) - span(b.job)
    : span(b.job) - span(a.job));
  return ordered.map(t => toPlan(t, router, ctx.rects, parentOf(t.edge, ctx.byId)));
}

/** Router with the reserved self-loops already committed to its ledger. */
function buildRouter(ctx: PlanContext, anchors: Point[], reserved: EdgePlan[]): GridRouter {
  const obstacles = ctx.graph.nodes.map(n => ctx.rects.get(n.id)!);
  const zones = ctx.graph.containers.map(c => ({ id: c.id, rect: ctx.rects.get(c.id)! }));
  const reservedPoints = reserved.flatMap(p => p.polyline);
  const router = new GridRouter(obstacles, [...anchors, ...reservedPoints], zones);
  reserved.forEach(p => router.reserve(p.polyline));
  return router;
}

/** Candidate with the fewest conflicts; ties keep the first candidate. */
function bestPlan(candidates: EdgePlan[][], loops: EdgePlan[]): EdgePlan[] {
  let best = candidates[0];
  let bestScore = planScore(best, loops);
  for (const candidate of candidates.slice(1)) {
    const score = planScore(candidate, loops);
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

/** Conflict count first, then fallbacks and route length as tie-breakers. */
export function planScore(plans: EdgePlan[], loops: EdgePlan[]): number[] {
  const all = [...plans, ...loops];
  const crossings = countCrossings(all.map(p => p.polyline));
  const fallbacks = all.filter(p => p.fallback).length;
  const length = all.reduce((sum, p) => sum + polylineLength(p.polyline), 0);
  return [crossings, fallbacks, length];
}

function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  }
  return total;
}
