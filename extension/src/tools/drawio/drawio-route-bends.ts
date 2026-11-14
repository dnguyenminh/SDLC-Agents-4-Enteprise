/**
 * SA4E-406 — committed bend index for the grid router.
 *
 * A route's internal corner is not a shared endpoint. A later route that
 * touches such a corner visually forms a T junction, even when the two
 * underlying segments only meet at their endpoints.
 */

import type { Point } from './drawio-geometry';

export class RouteBends {
  private readonly points = new Map<string, Point>();

  /** Record internal direction changes; route endpoints are shared anchors. */
  add(points: Point[]): void {
    for (let i = 1; i < points.length - 1; i++) {
      const previous = points[i - 1], current = points[i], next = points[i + 1];
      if (isStraight(previous, current, next)) continue;
      this.points.set(pointKey(current), current);
    }
  }

  /** Count committed bends lying on the inclusive candidate segment. */
  count(a: Point, b: Point): number {
    if (a.x === b.x) return this.countVertical(a, b);
    if (a.y === b.y) return this.countHorizontal(a, b);
    return 0;
  }

  private countHorizontal(a: Point, b: Point): number {
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
    let count = 0;
    for (const point of this.points.values()) {
      if (point.y === a.y && point.x >= minX && point.x <= maxX) count++;
    }
    return count;
  }

  private countVertical(a: Point, b: Point): number {
    const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
    let count = 0;
    for (const point of this.points.values()) {
      if (point.x === a.x && point.y >= minY && point.y <= maxY) count++;
    }
    return count;
  }
}

function isStraight(a: Point, b: Point, c: Point): boolean {
  return (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}
