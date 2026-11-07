/**
 * Edge port distribution — spread exit/entry anchors of multiple edges on the
 * same node across the node's perimeter so connectors do not stack on top of
 * each other. Sides are chosen from the geometric direction of each edge.
 */

import type { DiagramGraph, DiagramEdge } from './drawio-parser.js';
import { absoluteRects } from './drawio-geometry.js';
import type { Point, Rect } from './drawio-geometry.js';

export interface EdgePorts { exit?: Point; entry?: Point; }

/**
 * Compute per-edge anchors for nodes with 2+ outgoing/incoming edges.
 * Edges that already declare explicit exit/entry anchors are respected.
 */
export function distributePorts(graph: DiagramGraph, abs?: Map<string, Rect>): Map<string, EdgePorts> {
  const rects = abs ?? absoluteRects(graph);
  const result = new Map<string, EdgePorts>();
  assignSide(result, graph, rects, 'exit');
  assignSide(result, graph, rects, 'entry');
  return result;
}

/** Group edges per node on the given side, then spread fractions along it. */
function assignSide(
  result: Map<string, EdgePorts>, graph: DiagramGraph,
  rects: Map<string, Rect>, kind: 'exit' | 'entry',
): void {
  const byNode = groupByNode(graph, kind);
  for (const [nodeId, edges] of byNode) {
    const nodeRect = rects.get(nodeId);
    if (edges.length < 2 || !nodeRect) continue;
    for (const [edge, anchor] of spreadAlongSide(edges, rects, kind, nodeRect)) {
      const ports = result.get(edge.id) ?? {};
      ports[kind] = anchor;
      result.set(edge.id, ports);
    }
  }
}

/** Bucket edges by their endpoint node (source for exit, target for entry). */
function groupByNode(graph: DiagramGraph, kind: 'exit' | 'entry'): Map<string, DiagramEdge[]> {
  const map = new Map<string, DiagramEdge[]>();
  for (const edge of graph.edges) {
    const nodeId = kind === 'exit' ? edge.sourceId : edge.targetId;
    const list = map.get(nodeId) ?? [];
    list.push(edge);
    map.set(nodeId, list);
  }
  return map;
}

/**
 * Pick the side of each edge from the direction to its far endpoint, then
 * order edges per side by the far endpoint's cross-axis position and assign
 * evenly spread anchor fractions.
 */
function spreadAlongSide(
  edges: DiagramEdge[], rects: Map<string, Rect>, kind: 'exit' | 'entry', nodeRect: Rect,
): Array<[DiagramEdge, Point]> {
  const sides = new Map<'top' | 'bottom' | 'left' | 'right', DiagramEdge[]>();
  for (const edge of edges) {
    if (kind === 'exit' ? edge.exit : edge.entry) continue; // respect explicit anchors
    const far = rects.get(kind === 'exit' ? edge.targetId : edge.sourceId);
    if (!far) continue;
    const side = dominantSide(nodeRect, far);
    const list = sides.get(side) ?? [];
    list.push(edge);
    sides.set(side, list);
  }
  const out: Array<[DiagramEdge, Point]> = [];
  for (const [side, list] of sides) {
    list.sort((e1, e2) => crossCoord(e1, rects, kind, side) - crossCoord(e2, rects, kind, side));
    list.forEach((edge, i) => out.push([edge, anchorOn(side, (i + 1) / (list.length + 1))]));
  }
  return out;
}

/** Side of `from` facing the far rect (dominant axis of center-to-center). */
function dominantSide(from: Rect, far: Rect): 'top' | 'bottom' | 'left' | 'right' {
  const dx = (far.x + far.w / 2) - (from.x + from.w / 2);
  const dy = (far.y + far.h / 2) - (from.y + from.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/** Cross-axis coordinate used to order edges along a side. */
function crossCoord(
  edge: DiagramEdge, rects: Map<string, Rect>, kind: 'exit' | 'entry',
  side: 'top' | 'bottom' | 'left' | 'right',
): number {
  const far = rects.get(kind === 'exit' ? edge.targetId : edge.sourceId);
  if (!far) return 0;
  return (side === 'left' || side === 'right') ? far.y + far.h / 2 : far.x + far.w / 2;
}

/** Anchor fraction on a side: constant on the fixed axis, spread on the moving axis. */
function anchorOn(side: 'top' | 'bottom' | 'left' | 'right', f: number): Point {
  switch (side) {
    case 'left': return { x: 0, y: f };
    case 'right': return { x: 1, y: f };
    case 'top': return { x: f, y: 0 };
    case 'bottom': return { x: f, y: 1 };
  }
}
