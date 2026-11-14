/**
 * SA4E-406 — committed-route ledger for the grid router.
 *
 * The router needs the same conflict semantics as the detector: two routes
 * conflict when they overlap collinearly, or when a perpendicular segment
 * touches the other route (a shared endpoint is allowed). Point-only
 * pass-through markers are insufficient because a route can cross the
 * interior of a long segment.
 */

import type { Point } from './drawio-geometry';
import { RouteBends } from './drawio-route-bends';

interface Segment {
  /** Horizontal: y; vertical: x. */
  fixed: number;
  /** Horizontal: min x, max x; vertical: min y, max y. */
  from: number;
  to: number;
}

type Orientation = 'horizontal' | 'vertical';

interface OrientedSegment extends Segment {
  orientation: Orientation;
}

interface SegmentCounts {
  overlaps: number;
  crossings: number;
}

export interface SegmentConflicts extends SegmentCounts {
  /** Candidate segment touches a committed route corner (visual T junction). */
  touches: number;
}

class AxisIndex {
  private readonly byFixed = new Map<number, Segment[]>();
  private keys: number[] = [];

  add(segment: Segment): void {
    const list = this.byFixed.get(segment.fixed) ?? [];
    list.push(segment);
    this.byFixed.set(segment.fixed, list);
    this.insertKey(segment.fixed);
  }

  at(fixed: number): Segment[] {
    return this.byFixed.get(fixed) ?? [];
  }

  /** Segments whose fixed coordinate lies in [min, max]. */
  range(min: number, max: number): Segment[] {
    const lo = this.lowerBound(min);
    const hi = this.upperBound(max);
    const out: Segment[] = [];
    for (let i = lo; i < hi; i++) out.push(...this.at(this.keys[i]));
    return out;
  }

  private insertKey(fixed: number): void {
    if (this.byFixed.get(fixed)!.length > 1) return;
    const at = this.lowerBound(fixed);
    this.keys.splice(at, 0, fixed);
  }

  private lowerBound(value: number): number {
    let lo = 0, hi = this.keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.keys[mid] < value) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  private upperBound(value: number): number {
    let lo = 0, hi = this.keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.keys[mid] <= value) lo = mid + 1; else hi = mid;
    }
    return lo;
  }
}

/** Occupancy of routes already committed to a GridRouter. */
export class RouteLedger {
  private readonly horizontal = new AxisIndex();
  private readonly vertical = new AxisIndex();
  private readonly bends = new RouteBends();

  /**
   * Add every non-zero segment of a route. Consecutive collinear grid
   * intervals are merged first: an internal grid vertex is not a route
   * endpoint, so another route ending there still crosses the committed line.
   */
  addPolyline(points: Point[]): void {
    const segments: OrientedSegment[] = [];
    for (let i = 1; i < points.length; i++) {
      const segment = orientedSegment(points[i - 1], points[i]);
      if (!segment) continue;
      const previous = segments[segments.length - 1];
      if (previous && mergeSegment(previous, segment)) continue;
      segments.push(segment);
    }
    this.bends.add(points);
    for (const segment of segments) this.add(segment);
  }

  /**
   * Conflicts between a candidate segment and the committed routes.
   * `throughStart` marks that the candidate continues straight through `a`;
   * a committed endpoint at `a` is then an interior pass-through, not a
   * shared endpoint.
   */
  conflicts(a: Point, b: Point, throughStart = false): SegmentConflicts {
    const touches = this.bends.count(a, b);
    if (a.x === b.x) return { ...this.verticalConflicts(a, b, throughStart), touches };
    if (a.y === b.y) return { ...this.horizontalConflicts(a, b, throughStart), touches };
    return { overlaps: 0, crossings: 0, touches };
  }

  private add(segment: OrientedSegment): void {
    const stored = { fixed: segment.fixed, from: segment.from, to: segment.to };
    if (segment.orientation === 'vertical') this.vertical.add(stored);
    else this.horizontal.add(stored);
  }

  private horizontalConflicts(a: Point, b: Point, throughStart: boolean): SegmentCounts {
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
    let overlaps = 0;
    for (const s of this.horizontal.at(a.y)) {
      if (Math.min(maxX, s.to) > Math.max(minX, s.from)) overlaps++;
    }
    let crossings = 0;
    for (const s of this.vertical.range(minX, maxX)) {
      if (a.y < s.from || a.y > s.to) continue;
      const atEndX = s.fixed === minX || s.fixed === maxX;
      const atEndY = a.y === s.from || a.y === s.to;
      if (!atEndX || !atEndY) crossings++;
      else if (throughStart && s.fixed === a.x && atEndY) crossings++;
    }
    return { overlaps, crossings };
  }

  private verticalConflicts(a: Point, b: Point, throughStart: boolean): SegmentCounts {
    const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
    let overlaps = 0;
    for (const s of this.vertical.at(a.x)) {
      if (Math.min(maxY, s.to) > Math.max(minY, s.from)) overlaps++;
    }
    let crossings = 0;
    for (const s of this.horizontal.range(minY, maxY)) {
      if (a.x < s.from || a.x > s.to) continue;
      const atEndY = s.fixed === minY || s.fixed === maxY;
      const atEndX = a.x === s.from || a.x === s.to;
      if (!atEndY || !atEndX) crossings++;
      else if (throughStart && s.fixed === a.y && atEndX) crossings++;
    }
    return { overlaps, crossings };
  }
}

/** Segment for a non-zero horizontal/vertical point pair. */
function orientedSegment(a: Point, b: Point): OrientedSegment | null {
  if (a.x === b.x && a.y !== b.y) {
    return { orientation: 'vertical', fixed: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) };
  }
  if (a.y === b.y && a.x !== b.x) {
    return { orientation: 'horizontal', fixed: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) };
  }
  return null;
}

/** Extend `previous` when `next` continues the same straight route. */
function mergeSegment(previous: OrientedSegment, next: OrientedSegment): boolean {
  if (previous.orientation !== next.orientation || previous.fixed !== next.fixed) return false;
  const touches = previous.to === next.from || previous.from === next.to;
  if (!touches) return false;
  previous.from = Math.min(previous.from, next.from);
  previous.to = Math.max(previous.to, next.to);
  return true;
}
