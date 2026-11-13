/**
 * Orthogonal edge routing — computes waypoints so connectors avoid shapes.
 * Used by the local-repair path to reroute edges that cut through obstacles.
 */

import { DiagramGraph, DiagramNode } from './drawio-parser';

export interface Waypoint { x: number; y: number; }

/** Route all edges, returning map of edge_id → waypoints for edges needing routing. */
export function routeEdges(graph: DiagramGraph): Map<string, Waypoint[]> {
  const allNodes = [...graph.nodes, ...graph.containers];
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const routes = new Map<string, Waypoint[]>();

  for (const edge of graph.edges) {
    const src = nodeMap.get(edge.sourceId);
    const tgt = nodeMap.get(edge.targetId);
    if (!src || !tgt) continue;
    const obstacles = allNodes.filter(n => n.id !== src.id && n.id !== tgt.id);
    const waypoints = computeRoute(src, tgt, obstacles);
    if (waypoints.length > 0) routes.set(edge.id, waypoints);
  }
  return routes;
}

/**
 * Compute detour waypoints for one edge around the given obstacles.
 * Returns [] when the straight course is already clear.
 */
export function computeRoute(
  src: DiagramNode, tgt: DiagramNode, obstacles: DiagramNode[],
): Waypoint[] {
  const srcPort = exitPort(src, tgt);
  const tgtPort = entryPort(src, tgt);
  const crossed = obstacles.filter(o => lineIntersectsRect(srcPort, tgtPort, o));
  if (crossed.length === 0) return [];
  return orthogonalRoute(srcPort, tgtPort, crossed);
}

function orthogonalRoute(start: Waypoint, end: Waypoint, obstacles: DiagramNode[]): Waypoint[] {
  // Try L-shape: horizontal first
  const midL: Waypoint = { x: end.x, y: start.y };
  if (!anyIntersection(start, midL, obstacles) && !anyIntersection(midL, end, obstacles)) return [midL];
  // Try L-shape: vertical first
  const midL2: Waypoint = { x: start.x, y: end.y };
  if (!anyIntersection(start, midL2, obstacles) && !anyIntersection(midL2, end, obstacles)) return [midL2];
  // Z-shape: divert to a lane beyond the obstacle, turning at the ports
  const obs = obstacles[0];
  const offset = 30;
  if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
    const midY = (start.y + end.y) / 2;
    const bypassY = midY < obs.y + obs.height / 2 ? obs.y - offset : obs.y + obs.height + offset;
    return [{ x: start.x, y: bypassY }, { x: end.x, y: bypassY }];
  }
  const midX = (start.x + end.x) / 2;
  const bypassX = midX < obs.x + obs.width / 2 ? obs.x - offset : obs.x + obs.width + offset;
  return [{ x: bypassX, y: start.y }, { x: bypassX, y: end.y }];
}

function anyIntersection(a: Waypoint, b: Waypoint, obstacles: DiagramNode[]): boolean {
  return obstacles.some(o => lineIntersectsRect(a, b, o));
}

function lineIntersectsRect(a: Waypoint, b: Waypoint, node: DiagramNode): boolean {
  const margin = 5;
  const left = node.x - margin, right = node.x + node.width + margin;
  const top = node.y - margin, bottom = node.y + node.height + margin;
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  if (maxX < left || minX > right || maxY < top || minY > bottom) return false;
  const code1 = outCode(a.x, a.y, left, top, right, bottom);
  const code2 = outCode(b.x, b.y, left, top, right, bottom);
  if (code1 === 0 || code2 === 0) return true;
  if ((code1 & code2) !== 0) return false;
  return true;
}

function outCode(x: number, y: number, l: number, t: number, r: number, b: number): number {
  let code = 0;
  if (x < l) code |= 1;
  if (x > r) code |= 2;
  if (y < t) code |= 4;
  if (y > b) code |= 8;
  return code;
}

function exitPort(src: DiagramNode, tgt: DiagramNode): Waypoint {
  const dx = (tgt.x + tgt.width / 2) - (src.x + src.width / 2);
  const dy = (tgt.y + tgt.height / 2) - (src.y + src.height / 2);
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { x: src.x + src.width, y: src.y + src.height / 2 }
      : { x: src.x, y: src.y + src.height / 2 };
  }
  return dy > 0
    ? { x: src.x + src.width / 2, y: src.y + src.height }
    : { x: src.x + src.width / 2, y: src.y };
}

function entryPort(src: DiagramNode, tgt: DiagramNode): Waypoint {
  const dx = (src.x + src.width / 2) - (tgt.x + tgt.width / 2);
  const dy = (src.y + src.height / 2) - (tgt.y + tgt.height / 2);
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { x: tgt.x + tgt.width, y: tgt.y + tgt.height / 2 }
      : { x: tgt.x, y: tgt.y + tgt.height / 2 };
  }
  return dy > 0
    ? { x: tgt.x + tgt.width / 2, y: tgt.y + tgt.height }
    : { x: tgt.x + tgt.width / 2, y: tgt.y };
}
