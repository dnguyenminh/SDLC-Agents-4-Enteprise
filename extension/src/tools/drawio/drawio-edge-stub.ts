/**
 * SA4E-406 — the short straight stub an edge leaves a port with before the grid router takes over.
 */

import type { Point, Rect } from './drawio-geometry';
import { OBSTACLE_MARGIN, type Dir } from './drawio-grid-router';

const STUB = 20;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const round2 = (v: number): number => Math.round(v * 100) / 100;

export function stubOf(p: Point, side: Dir, length: number): Point {
  return { x: round2(p.x + DX[side] * length), y: round2(p.y + DY[side] * length) };
}

/**
 * Length of the stub leaving a port. The router inflates every node by OBSTACLE_MARGIN, so a stub that
 * ends inside the neighbour's inflated box has no way out and the edge falls back to a straight line
 * through the nodes. Where the free gap ahead is small the stub shortens to the middle of the gap.
 */
export function stubLength(port: Point, side: Dir, self: Rect, obstacles: Rect[]): number {
  const horizontal = side % 2 === 0;
  let gap = Infinity;
  for (const r of obstacles) {
    if (r === self) continue;
    const across = horizontal ? port.y >= r.y - OBSTACLE_MARGIN && port.y <= r.y + r.h + OBSTACLE_MARGIN : port.x >= r.x - OBSTACLE_MARGIN && port.x <= r.x + r.w + OBSTACLE_MARGIN;
    if (!across) continue;
    const ahead = side === 0 ? r.x - port.x : side === 2 ? port.x - (r.x + r.w) : side === 1 ? r.y - port.y : port.y - (r.y + r.h);
    if (ahead >= 0) gap = Math.min(gap, ahead);
  }
  return gap >= 2 * STUB ? STUB : Math.max(OBSTACLE_MARGIN + 1, gap / 2);
}
