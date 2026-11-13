/**
 * Local repair — edge passes: detour crossing edges around their obstacle and
 * split stacked parallel edges (legacy single-obstacle router; the apply step
 * re-plans edges with the grid router afterwards).
 */

import type { DiagramGraph, DiagramNode } from './drawio-parser';
import type { Point } from './drawio-geometry';
import type { LayoutIssue } from './drawio-detect';
import { computeRoute } from './drawio-router';
import { curRect, type Ctx } from './drawio-repair-ctx';

const STACK_OFFSET = 24;   // perpendicular offset for stacked parallel edges

/** Reroute crossing edges around their detected obstacle; split stacked pairs. */
export function rerouteEdges(ctx: Ctx, graph: DiagramGraph, issues: LayoutIssue[]): Map<string, Point[]> {
  const routes = new Map<string, Point[]>();
  for (const issue of issues) {
    if (issue.type === 'edge_crossing' || issue.type === 'edge_container_crossing') {
      rerouteOne(ctx, graph, String(issue.edge_id), String(issue.crosses_node ?? issue.crosses_container), routes);
    } else if (issue.type === 'stacked_edges') {
      offsetStacked(ctx, graph, String(issue.edge_a), String(issue.edge_b), routes);
    }
  }
  return routes;
}

function rerouteOne(ctx: Ctx, graph: DiagramGraph, edgeId: string, obstacleId: string, routes: Map<string, Point[]>): void {
  const edge = graph.edges.find(e => e.id === edgeId);
  const obstacle = ctx.byId.get(obstacleId);
  if (!edge || !obstacle) return;
  const src = absCell(ctx, edge.sourceId), tgt = absCell(ctx, edge.targetId);
  if (!src || !tgt) return;
  const waypoints = computeRoute(src, tgt, [absCell(ctx, obstacleId)!]);
  if (waypoints.length === 0) return; // router found no detour — reported as remaining
  routes.set(edgeId, toEdgeSpace(ctx, edge.parentId, waypoints));
}

/** Give the second of two stacked parallel edges a perpendicular detour. */
function offsetStacked(ctx: Ctx, graph: DiagramGraph, edgeAId: string, edgeBId: string, routes: Map<string, Point[]>): void {
  const edgeA = graph.edges.find(e => e.id === edgeAId);
  const edgeB = graph.edges.find(e => e.id === edgeBId);
  const src = ctx.rects.get(edgeB?.sourceId ?? '');
  const tgt = ctx.rects.get(edgeB?.targetId ?? '');
  if (!edgeA || !edgeB || !src || !tgt) return;
  const sx = src.x + src.w / 2, sy = src.y + src.h / 2;
  const tx = tgt.x + tgt.w / 2, ty = tgt.y + tgt.h / 2;
  const mx = (sx + tx) / 2, my = (sy + ty) / 2;
  const len = Math.max(1, Math.hypot(tx - sx, ty - sy));
  const waypoint = { x: mx + (-(ty - sy) / len) * STACK_OFFSET, y: my + ((tx - sx) / len) * STACK_OFFSET };
  routes.set(edgeBId, toEdgeSpace(ctx, edgeB.parentId, [waypoint]));
}

/** Clone a cell with absolute coordinates for the router. */
function absCell(ctx: Ctx, id: string): DiagramNode | null {
  const cell = ctx.byId.get(id);
  if (!cell) return null;
  const r = curRect(ctx, id);
  return { ...cell, x: r.x, y: r.y };
}

/** Absolute waypoints → edge-parent space (parent origin + parent shift). */
function toEdgeSpace(ctx: Ctx, parentId: string, points: Point[]): Point[] {
  const origin = ctx.rects.get(parentId) ?? { x: 0, y: 0 };
  const s = ctx.shift.get(parentId) ?? { x: 0, y: 0 };
  return points.map(p => ({ x: p.x - origin.x - s.x, y: p.y - origin.y - s.y }));
}
