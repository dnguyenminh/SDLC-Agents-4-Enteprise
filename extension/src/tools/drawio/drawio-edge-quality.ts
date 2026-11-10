/**
 * SA4E-406 — quality measures for planned edge routes, used to refine port
 * order: route once, read which way each edge really turns, reorder the ports
 * on each node accordingly, route again, keep the better plan.
 */

import { segsCross } from './drawio-geometry';
import type { Point } from './drawio-geometry';
import type { Dir } from './drawio-grid-router';

/** Absolute route of one edge plus the node sides it uses. */
export interface RoutedEdge { id: string; polyline: Point[]; exitSide: Dir; entrySide: Dir; }

/** Number of crossing/overlapping segment pairs between different edges. */
export function countCrossings(lines: Point[][]): number {
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) n += pairCrossings(lines[i], lines[j]);
  }
  return n;
}

function pairCrossings(a: Point[], b: Point[]): number {
  let n = 0;
  for (let i = 1; i < a.length; i++) {
    for (let k = 1; k < b.length; k++) if (segsCross(a[i - 1], a[i], b[k - 1], b[k])) n++;
  }
  return n;
}

/**
 * Where each edge end actually heads: the first cross-axis coordinate (relative
 * to the side it leaves/enters) at which the route leaves its own port line.
 * Keys are `${edgeId}|exit` and `${edgeId}|entry`.
 */
export function lateralHints(routes: RoutedEdge[]): Map<string, number> {
  const hints = new Map<string, number>();
  for (const r of routes) {
    hints.set(`${r.id}|exit`, headingOf(r.polyline, r.exitSide));
    hints.set(`${r.id}|entry`, headingOf([...r.polyline].reverse(), r.entrySide));
  }
  return hints;
}

function headingOf(fromPort: Point[], side: Dir): number {
  const axis = (p: Point): number => (side % 2 === 0 ? p.y : p.x);
  const own = axis(fromPort[0]);
  const turn = fromPort.slice(1).find(p => Math.abs(axis(p) - own) > 1);
  return axis(turn ?? fromPort[fromPort.length - 1]);
}
