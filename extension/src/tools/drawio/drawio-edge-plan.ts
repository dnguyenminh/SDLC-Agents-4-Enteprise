/**
 * SA4E-406 — fresh edge routing after a relayout.
 *
 * LLM-authored edges carry waypoints, terminal hints and a `parent` that all
 * belong to the OLD positions. After nodes move, none of it is valid, so every
 * connected edge is re-planned from the NEW geometry:
 *   1. parent  = lowest common container of its two ends;
 *   2. ports   = facing sides, spread along each side;
 *   3. route   = orthogonal A* around every node;
 *   4. write   = parent, exit/entry anchors, waypoints; stale hints dropped.
 */

import type { DiagramGraph } from './drawio-parser';
import type { Point } from './drawio-geometry';
import type { Dir } from './drawio-grid-router';
import { planSelfLoops } from './drawio-edge-loops';
import { buildPlanContext, orderedAncestors } from './drawio-edge-route-geometry';
import { planCandidate } from './drawio-edge-candidates';
import { repairEdgeConflicts } from './drawio-edge-conflict-repair';
import {
  clearEdgeTerminalPoints, setCellParent, setEdgePointsXml, upsertEdgeStyleKeys,
} from './drawio-xml-utils';

export interface EdgePlan {
  id: string;
  /** Container the edge lives in ('1' = root). Waypoints are relative to it. */
  parentId: string;
  exit: Point;
  entry: Point;
  waypoints: Point[];
  /** Absolute route incl. both ports, and the node sides used. */
  polyline: Point[];
  exitSide: Dir;
  entrySide: Dir;
  /** True when the grid router found no path and a plain elbow was used. */
  fallback?: boolean;
}

/**
 * Plan fresh routes for every connected, routable edge of the graph.
 * Route order is refined, then any remaining local conflict is repaired by
 * moving one endpoint to another node side.
 */
export function planEdges(graph: DiagramGraph): EdgePlan[] {
  const ctx = buildPlanContext(graph);
  const loops = planSelfLoops(graph.edges, ctx.rects, id => orderedAncestors(id, ctx.byId)[0] ?? '1');
  const candidate = planCandidate(ctx, loops);
  const repaired = repairEdgeConflicts(ctx, loops, candidate);
  return [...repaired, ...loops];
}

/** Write plans into the XML (parent, anchors, waypoints; stale hints removed). */
export function applyEdgePlans(xml: string, plans: EdgePlan[]): string {
  let out = xml;
  for (const plan of plans) {
    out = setCellParent(out, plan.id, plan.parentId);
    out = clearEdgeTerminalPoints(out, plan.id);
    out = setEdgePointsXml(out, plan.id, plan.waypoints);
    out = upsertEdgeStyleKeys(out, plan.id, edgeStyleKeys(plan));
  }
  return out;
}

/** Force draw.io to render the planned orthogonal route. */
function edgeStyleKeys(plan: EdgePlan): Record<string, string | number> {
  return {
    edgeStyle: 'orthogonalEdgeStyle', curved: 0,
    exitX: plan.exit.x, exitY: plan.exit.y,
    entryX: plan.entry.x, entryY: plan.entry.y,
  };
}
