/**
 * SA4E-406 — local repair for edge conflicts that greedy route ordering cannot
 * resolve. One edge is re-routed from another node side while every other
 * route remains fixed; the candidate is kept only when the global conflict
 * score improves.
 */

import type { EdgePlan } from './drawio-edge-plan';
import { assignPorts, type PortSideOverrides } from './drawio-edge-ports';
import { planScore } from './drawio-edge-candidates';
import { segsCross } from './drawio-geometry';
import type { Point } from './drawio-geometry';
import { GridRouter, type Dir } from './drawio-grid-router';
import {
  endpoints, parentOf, relatedContainers, toPlan,
  type PlanContext,
} from './drawio-edge-route-geometry';

/** Maximum number of successful local repairs in one planning call. */
const MAX_REPAIR_PASSES = 6;

/** Re-route one conflicting edge at a time until the plan has no intersections. */
export function repairEdgeConflicts(ctx: PlanContext, loops: EdgePlan[], initial: EdgePlan[]): EdgePlan[] {
  let best = initial;
  for (let pass = 0; pass < MAX_REPAIR_PASSES; pass++) {
    const pair = firstConflict([...best, ...loops]);
    if (!pair) break;
    const improved = repairConflictPair(ctx, loops, best, pair);
    if (!improved) break;
    best = improved;
  }
  return best;
}

/** First pair of edge plans whose rendered segments intersect. */
function firstConflict(plans: EdgePlan[]): [EdgePlan, EdgePlan] | null {
  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      if (pathsCross(plans[i].polyline, plans[j].polyline)) return [plans[i], plans[j]];
    }
  }
  return null;
}

function pathsCross(a: Point[], b: Point[]): boolean {
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (segsCross(a[i - 1], a[i], b[j - 1], b[j])) return true;
    }
  }
  return false;
}

/** Try alternate source/target sides for both edges in one conflict. */
function repairConflictPair(
  ctx: PlanContext, loops: EdgePlan[], plans: EdgePlan[], pair: [EdgePlan, EdgePlan],
): EdgePlan[] | null {
  let best: EdgePlan[] | null = null;
  let bestScore = planScore(plans, loops);
  for (const plan of pair) {
    if (!ctx.edges.some(e => e.id === plan.id)) continue;
    for (const role of ['exit', 'entry'] as const) {
      for (const side of sidesFor(ctx, plans, plan.id, role)) {
        const candidate = rerouteEdge(ctx, loops, plans, plan.id, role, side);
        if (!candidate) continue;
        const score = planScore(candidate, loops);
        if (score < bestScore) { best = candidate; bestScore = score; }
      }
    }
  }
  return best;
}

/** Candidate port sides, preferring a side unused by the other incident edges. */
function sidesFor(ctx: PlanContext, plans: EdgePlan[], edgeId: string, role: 'exit' | 'entry'): Dir[] {
  const edge = ctx.edges.find(e => e.id === edgeId)!;
  const nodeId = role === 'exit' ? edge.sourceId : edge.targetId;
  const used = usedSides(ctx, plans, nodeId);
  const all = [0, 1, 2, 3] as Dir[];
  return [...all.filter(side => !used.has(side)), ...all.filter(side => used.has(side))];
}

/** Sides already occupied at a node by another incident edge. */
function usedSides(ctx: PlanContext, plans: EdgePlan[], nodeId: string): Set<Dir> {
  const used = new Set<Dir>();
  for (const plan of plans) {
    const edge = ctx.edges.find(e => e.id === plan.id);
    if (!edge) continue;
    if (edge.sourceId === nodeId) used.add(plan.exitSide);
    if (edge.targetId === nodeId) used.add(plan.entrySide);
  }
  return used;
}

/** Re-route one edge with a different side while every other route stays fixed. */
function rerouteEdge(
  ctx: PlanContext, loops: EdgePlan[], plans: EdgePlan[], edgeId: string,
  role: 'exit' | 'entry', side: Dir,
): EdgePlan[] | null {
  const overrides: PortSideOverrides = new Map([[edgeId, { [role]: side }]]);
  const ports = assignPorts(ctx.edges, ctx.byId, ctx.rects, undefined, overrides);
  const edge = ctx.edges.find(e => e.id === edgeId)!;
  const obstacles = ctx.graph.nodes.map(n => ctx.rects.get(n.id)!);
  const target = endpoints(edge, ctx.rects, ports.get(edgeId)!, relatedContainers(edge, ctx.byId), obstacles);
  const others = plans.filter(p => p.id !== edgeId);
  const reserved = [...others, ...loops];
  const zones = ctx.graph.containers.map(c => ({ id: c.id, rect: ctx.rects.get(c.id)! }));
  const router = new GridRouter(obstacles, [target.job.start, target.job.end, ...reserved.flatMap(p => p.polyline)], zones);
  reserved.forEach(p => router.reserve(p.polyline));
  const plan = toPlan(target, router, ctx.rects, parentOf(edge, ctx.byId));
  return [...others, plan].sort((a, b) => a.id.localeCompare(b.id));
}
