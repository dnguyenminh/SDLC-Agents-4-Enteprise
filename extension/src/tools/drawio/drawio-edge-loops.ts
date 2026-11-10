/**
 * SA4E-406 — self-referencing edges (source === target, e.g. a recursive
 * relation in a class diagram).
 *
 * They cannot go through the grid router (start and end are the same box), but
 * leaving their LLM-authored waypoints in place is harmful: those coordinates
 * belong to a layout that no longer exists and can be thousands of px away,
 * stretching the whole diagram. Each loop is redrawn as a small square bracket
 * on the right side of its node.
 */

import type { DiagramEdge } from './drawio-parser';
import type { Point, Rect } from './drawio-geometry';
import type { EdgePlan } from './drawio-edge-plan';

/** How far the loop sticks out of the node (px). */
const LOOP_OUT = 30;
/** Fractions of the node height where the loop leaves and re-enters. */
const EXIT_FRAC = 0.33;
const ENTRY_FRAC = 0.67;

/** Plans for every connected edge whose two ends are the same cell. */
export function planSelfLoops(
  edges: DiagramEdge[], rects: Map<string, Rect>, parentOfCell: (id: string) => string,
): EdgePlan[] {
  return edges
    .filter(e => e.sourceId !== '' && e.sourceId === e.targetId && rects.has(e.sourceId))
    .map(e => loopPlan(e, rects.get(e.sourceId)!, parentOfCell(e.sourceId), rects));
}

function loopPlan(edge: DiagramEdge, r: Rect, parentId: string, rects: Map<string, Rect>): EdgePlan {
  const exit: Point = { x: r.x + r.w, y: round2(r.y + EXIT_FRAC * r.h) };
  const entry: Point = { x: r.x + r.w, y: round2(r.y + ENTRY_FRAC * r.h) };
  const out = r.x + r.w + LOOP_OUT;
  const bends: Point[] = [{ x: out, y: exit.y }, { x: out, y: entry.y }];
  const origin = parentId === '1' ? { x: 0, y: 0 } : rects.get(parentId) ?? { x: 0, y: 0 };
  return {
    id: edge.id, parentId,
    exit: { x: 1, y: EXIT_FRAC }, entry: { x: 1, y: ENTRY_FRAC },
    waypoints: bends.map(p => ({ x: round2(p.x - origin.x), y: round2(p.y - origin.y) })),
    polyline: [exit, ...bends, entry], exitSide: 0, entrySide: 0,
  };
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
