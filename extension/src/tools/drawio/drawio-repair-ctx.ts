/**
 * Local repair — shared state of the repair passes (original rects, accumulated
 * shifts, container resizes) and the helpers that read it.
 */

import type { DiagramNode } from './drawio-parser';
import type { Point, Rect } from './drawio-geometry';

export interface Ctx {
  byId: Map<string, DiagramNode>;
  rects: Map<string, Rect>;                  // original absolute rects
  shift: Map<string, Point>;                 // accumulated absolute deltas
  resizes: Map<string, { w: number; h: number }>;
  spacing: number;
}

/** Current absolute rect of a cell, including accumulated shift and resize. */
export function curRect(ctx: Ctx, id: string): Rect {
  const base = ctx.rects.get(id);
  if (!base) return { x: 0, y: 0, w: 0, h: 0 };
  const s = ctx.shift.get(id) ?? { x: 0, y: 0 };
  const r = ctx.resizes.get(id);
  return {
    x: base.x + s.x, y: base.y + s.y,
    w: r ? Math.max(base.w, r.w) : base.w, h: r ? Math.max(base.h, r.h) : base.h,
  };
}

export function addShift(shift: Map<string, Point>, id: string, d: Point): void {
  const cur = shift.get(id) ?? { x: 0, y: 0 };
  shift.set(id, { x: cur.x + d.x, y: cur.y + d.y });
}
