/**
 * SA4E-406 — soft "no-go" zones for the edge router.
 *
 * Containers (class boxes, bands, lanes) are not obstacles: an edge may cross
 * them. But running INSIDE a container that neither end of the edge belongs to
 * reads as the edge passing through that box (a relation seemingly cutting an
 * entity in half). Each pixel travelled inside such a container is charged, so
 * the router prefers the corridors between boxes and crosses a box only when
 * there is no sensible way around.
 */

import type { Point, Rect } from './drawio-geometry';

export interface RouteZone { id: string; rect: Rect; }

/** Extra cost per px travelled inside an unrelated container (on top of the length itself). */
const ZONE_COST_PER_PX = 2;

export class ZoneIndex {
  constructor(private readonly zones: readonly RouteZone[]) {}

  /**
   * Penalty for the axis-aligned segment a→b.
   * @param related containers the edge legitimately enters (ancestors of its ends)
   */
  penalty(a: Point, b: Point, related?: ReadonlySet<string>): number {
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    for (const z of this.zones) {
      // On a border the line merges with the container outline (a lane separator
      // looks like it carries the edge) — ambiguous whether the edge is related or not.
      if (onBorder(a, b, z.rect)) return len * ZONE_COST_PER_PX;
      if (related?.has(z.id)) continue;
      const r = z.rect;
      if (mid.x > r.x && mid.x < r.x + r.w && mid.y > r.y && mid.y < r.y + r.h) return len * ZONE_COST_PER_PX;
    }
    return 0;
  }
}

/** Lines closer than this to a border visually merge with it, so they count as "on" it (px). */
const BORDER_TOL = 6;

/** True when the segment runs along one of the rect's sides (not merely crossing it). */
function onBorder(a: Point, b: Point, r: Rect): boolean {
  const near = (v: number, w: number): boolean => Math.abs(v - w) <= BORDER_TOL;
  const overlaps = (p: number, q: number, lo: number, hi: number): boolean => Math.max(p, q) > lo && Math.min(p, q) < hi;
  if (a.y === b.y && a.x !== b.x) {
    return (near(a.y, r.y) || near(a.y, r.y + r.h)) && overlaps(a.x, b.x, r.x, r.x + r.w);
  }
  if (a.x === b.x && a.y !== b.y) {
    return (near(a.x, r.x) || near(a.x, r.x + r.w)) && overlaps(a.y, b.y, r.y, r.y + r.h);
  }
  return false;
}
