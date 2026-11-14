/**
 * SA4E-406 — orthogonal edge router (A* over a Hanan-style grid).
 *
 * The grid lines come from the (inflated) obstacle borders, every port/stub
 * anchor, and lane lines through the free gutters between them. Paths are
 * found per edge with costs for length, bends, and — across edges — for
 * running on top of (overlap) or straight through (crossing) routes already
 * committed, so later edges prefer free lanes and parallel edges fan out.
 *
 * Pure geometry: no XML, no draw.io knowledge. Coordinates are absolute.
 */

import type { Point, Rect } from './drawio-geometry';
import { MinHeap } from './drawio-min-heap';
import { ZoneIndex, type RouteZone } from './drawio-zone-index';
import { buildAxis, r2 } from './drawio-grid-axis';
import { RouteLedger } from './drawio-route-ledger';

/** Travel direction: 0=right(+x) 1=down(+y) 2=left(-x) 3=up(-y). */
export type Dir = 0 | 1 | 2 | 3;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

const BEND_COST = 60;
const OVERLAP_COST = 10_000; // sharing a segment with another edge
const CROSS_COST = 10_000; // touching another edge away from a shared endpoint
const TOUCH_COST = 10_000; // touching another edge's internal corner
export const OBSTACLE_MARGIN = 10;
const MAX_AXIS_LINES = 700;
const MAX_EXPANSIONS = 400_000;

/** One routing request between two stub points (outside their nodes). */
export interface RouteJob {
  start: Point; end: Point; startDir: Dir; endDir: Dir;
  /** Containers this edge legitimately runs inside (ancestors of its ends); others are charged. */
  related?: ReadonlySet<string>;
}

export class GridRouter {
  private readonly xs: number[];
  private readonly ys: number[];
  private readonly xi = new Map<number, number>();
  private readonly yi = new Map<number, number>();
  private readonly walls: Rect[];
  private readonly blocked = new Map<number, boolean>();
  private readonly ledger = new RouteLedger();

  private readonly zones: ZoneIndex;

  /** @param obstacles node rects to avoid  @param anchors every stub point that will be routed  @param zones containers to stay out of unless related */
  constructor(obstacles: Rect[], anchors: Point[], zones: RouteZone[] = []) {
    this.zones = new ZoneIndex(zones);
    this.walls = obstacles.map(o => ({
      x: o.x - OBSTACLE_MARGIN, y: o.y - OBSTACLE_MARGIN,
      w: o.w + 2 * OBSTACLE_MARGIN, h: o.h + 2 * OBSTACLE_MARGIN,
    }));
    const vx = [...this.walls.flatMap(w => [w.x, w.x + w.w]), ...anchors.map(a => a.x)];
    const vy = [...this.walls.flatMap(w => [w.y, w.y + w.h]), ...anchors.map(a => a.y)];
    const lanes = vx.length < MAX_AXIS_LINES / 4 && vy.length < MAX_AXIS_LINES / 4;
    this.xs = buildAxis(vx, lanes);
    this.ys = buildAxis(vy, lanes);
    this.xs.forEach((v, i) => this.xi.set(v, i));
    this.ys.forEach((v, i) => this.yi.set(v, i));
  }

  /** Find and commit the cheapest orthogonal route; null when none exists. */
  route(job: RouteJob): Point[] | null {
    const from = this.pointId(job.start), to = this.pointId(job.end);
    if (from === null || to === null) return null;
    const states = this.search(from, to, job);
    if (!states) return null;
    this.commit(states);
    return this.corners(states);
  }

  /** Reserve an already planned route (for example a self-loop) before routing other edges. */
  reserve(points: Point[]): void {
    this.ledger.addPolyline(points);
  }

  private get nx(): number { return this.xs.length; }
  private get ny(): number { return this.ys.length; }

  private pointId(p: Point): number | null {
    const ix = this.xi.get(r2(p.x)), iy = this.yi.get(r2(p.y));
    return ix === undefined || iy === undefined ? null : iy * this.nx + ix;
  }

  private coord(id: number): Point {
    return { x: this.xs[id % this.nx], y: this.ys[Math.floor(id / this.nx)] };
  }

  /** A* over (point, direction) states; returns the state chain start→end. */
  private search(from: number, to: number, job: RouteJob): number[] | null {
    const size = this.nx * this.ny * 4;
    if (size > 6_000_000) return null;
    const g = new Float64Array(size).fill(Infinity);
    const prev = new Int32Array(size).fill(-1);
    const open = new MinHeap<number>();
    const closed = new Uint8Array(size);
    const target = this.coord(to);
    const wantDir = ((job.endDir + 2) % 4) as Dir;
    const s0 = from * 4 + job.startDir;
    g[s0] = 0;
    open.push(0, s0);
    for (let n = 0; open.size > 0 && n < MAX_EXPANSIONS; n++) {
      const s = open.pop()!;
      if (closed[s]) continue;
      closed[s] = 1;
      if (Math.floor(s / 4) === to) return this.chain(prev, s);
      for (let nd = 0; nd < 4; nd++) {
        const step = this.step(s, nd as Dir, to, wantDir, job.related, Math.floor(s / 4) === from);
        if (!step || g[s] + step.cost >= g[step.state]) continue;
        g[step.state] = g[s] + step.cost;
        prev[step.state] = s;
        const c = this.coord(Math.floor(step.state / 4));
        open.push(g[step.state] + Math.abs(c.x - target.x) + Math.abs(c.y - target.y), step.state);
      }
    }
    return null;
  }

  /** Cost and next state of moving one grid interval in `nd`; null when blocked. */
  private step(
    s: number, nd: Dir, to: number, wantDir: Dir, related: ReadonlySet<string> | undefined,
    atRouteStart: boolean,
  ): { state: number; cost: number } | null {
    const d = s % 4, id = Math.floor(s / 4);
    if (nd === ((d + 2) % 4)) return null; // no U-turns
    const ix = id % this.nx, iy = Math.floor(id / this.nx);
    const jx = ix + DX[nd], jy = iy + DY[nd];
    if (jx < 0 || jy < 0 || jx >= this.nx || jy >= this.ny) return null;
    if (this.isBlocked(ix, iy, jx, jy)) return null;
    const next = jy * this.nx + jx;
    const a = this.coord(id), b = this.coord(next);
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    let cost = len + this.zones.penalty(a, b, related);
    if (nd !== d) cost += BEND_COST;
    if (next === to && nd !== wantDir) cost += BEND_COST;
    cost += this.occupancyCost(a, b, !atRouteStart && nd === d);
    return { state: next * 4 + nd, cost };
  }

  private occupancyCost(a: Point, b: Point, throughStart: boolean): number {
    const conflicts = this.ledger.conflicts(a, b, throughStart);
    return conflicts.overlaps * OVERLAP_COST
      + conflicts.crossings * CROSS_COST
      + conflicts.touches * TOUCH_COST;
  }

  /** True when the grid interval (i→j) cuts through any inflated obstacle. */
  private isBlocked(ix: number, iy: number, jx: number, jy: number): boolean {
    const key = (Math.min(iy, jy) * this.nx + Math.min(ix, jx)) * 2 + (iy === jy ? 0 : 1);
    const memo = this.blocked.get(key);
    if (memo !== undefined) return memo;
    const x1 = Math.min(this.xs[ix], this.xs[jx]), x2 = Math.max(this.xs[ix], this.xs[jx]);
    const y1 = Math.min(this.ys[iy], this.ys[jy]), y2 = Math.max(this.ys[iy], this.ys[jy]);
    const hit = this.walls.some(w => x2 > w.x && x1 < w.x + w.w && y2 > w.y && y1 < w.y + w.h
      && (iy === jy ? y1 > w.y && y1 < w.y + w.h : x1 > w.x && x1 < w.x + w.w));
    this.blocked.set(key, hit);
    return hit;
  }

  private chain(prev: Int32Array, last: number): number[] {
    const out: number[] = [];
    for (let s = last; s !== -1; s = prev[s]) out.push(s);
    return out.reverse();
  }

  /** Record the route as occupied; the ledger merges its grid intervals. */
  private commit(states: number[]): void {
    this.ledger.addPolyline(states.map(s => this.coord(Math.floor(s / 4))));
  }

  /** Corner points of the route (collinear intermediate points removed). */
  private corners(states: number[]): Point[] {
    const pts = states.map(s => this.coord(Math.floor(s / 4)));
    return pts.filter((p, i) => {
      if (i === 0 || i === pts.length - 1) return true;
      const a = pts[i - 1], b = pts[i + 1];
      return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
    });
  }
}
