/**
 * SA4E-406 — placement of the actors of a use-case diagram.
 *
 * The primary actor sits at the centre of the use-case arc (decided by the plan).
 * Every other actor tries both sides of the diagram at several heights around
 * the use cases it is associated with and takes the candidate whose association
 * lines cut the fewest foreign ellipses, then the shortest lines. Lines are
 * straight, so "cuts an ellipse" is a plain geometric test.
 */

import type { DiagramNode } from './drawio-parser';
import type { Point, Rect } from './drawio-geometry';
import { isEllipseStyle } from './drawio-detect-usecase';
import type { Ctx } from './drawio-usecase-column';

const ACTOR_GAP = 160; // room for the association fan between actor and boundary
const STACK_GAP = 40;
const LABEL_ROOM = 30; // an actor's label sits under the figure
const STEP = 60; // vertical spacing of the candidate positions
const STEPS = 7; // candidates above and below the ideal height
const HIT_COST = 1000; // one cut ellipse is worse than any amount of extra length
const CROSS_COST = 200; // two association lines crossing: better avoided than a longer line
const BOUNDARY_COST = 300; // a line running through another system's boundary
const SAMPLE_PX = 6;

type Side = 'left' | 'right';
type Line = [Point, Point];
/** A system boundary: its rect and the use cases it owns. */
export interface BoundaryInfo { rect: Rect; caseIds: Set<string>; }
interface Placed { side: Side; y: number; h: number; }

/** Case ids an actor is associated with. */
function targetsOf(ctx: Ctx, actorId: string): string[] {
  return ctx.edges.flatMap(e => (e.sourceId === actorId ? [e.targetId] : e.targetId === actorId ? [e.sourceId] : []))
    .filter(id => ctx.caseIds.has(id));
}

/** True when (x, y) lies inside the use case drawn in `r` (an ellipse inscribed in it, or the box itself). */
function insideShape(x: number, y: number, r: Rect, ellipse: boolean): boolean {
  if (!ellipse) return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  const dx = (x - (r.x + r.w / 2)) / (r.w / 2), dy = (y - (r.y + r.h / 2)) / (r.h / 2);
  return dx * dx + dy * dy < 1;
}

const inRect = (p: Point, r: Rect): boolean => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

/** What a candidate position is measured against. */
interface Scene {
  abs: (id: string) => Rect;
  cases: Array<{ id: string; ellipse: boolean }>;
  boundaries: BoundaryInfo[];
}

/**
 * Cost of the lines from `from` to each target centre: cut foreign use cases dominate, then
 * running through another system's boundary, then length.
 */
function lineCost(from: Point, targets: string[], scene: Scene): number {
  let cost = 0;
  for (const t of targets) {
    const r = scene.abs(t), to = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const n = Math.max(2, Math.ceil(len / SAMPLE_PX));
    const hit = new Set<string>(), crossed = new Set<BoundaryInfo>();
    for (let i = 1; i < n; i++) {
      const p = { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n };
      for (const c of scene.cases) if (c.id !== t && insideShape(p.x, p.y, scene.abs(c.id), c.ellipse)) hit.add(c.id);
      for (const b of scene.boundaries) if (!b.caseIds.has(t) && inRect(p, b.rect)) crossed.add(b);
    }
    cost += len + HIT_COST * hit.size + BOUNDARY_COST * crossed.size;
  }
  return cost;
}

/** True when the two segments cross in their interiors (shared end points do not count). */
function properlyCross([a, b]: Line, [c, d]: Line): boolean {
  const side = (p: Point, q: Point, r: Point): number => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** Association lines from one point to each target centre. */
function linesFrom(from: Point, targets: string[], abs: (id: string) => Rect): Line[] {
  return targets.map(t => [from, { x: abs(t).x + abs(t).w / 2, y: abs(t).y + abs(t).h / 2 }] as Line);
}

/**
 * Candidate (side, y) positions for an actor: steps around the ideal height, plus the gaps
 * between system boundaries (a line from a gap reaches either neighbour without crossing the other).
 */
function candidates(a: DiagramNode, mid: number, extent: Rect, gaps: number[]): Array<{ side: Side; x: number; y: number }> {
  const out: Array<{ side: Side; x: number; y: number }> = [];
  const ys = [...Array.from({ length: 2 * STEPS + 1 }, (_, i) => mid - a.height / 2 + (i - STEPS) * STEP), ...gaps.map(g => g - a.height / 2)];
  for (const side of ['left', 'right'] as Side[]) {
    const x = side === 'left' ? extent.x - ACTOR_GAP - a.width : extent.x + extent.w + ACTOR_GAP;
    for (const y of ys) if (y >= extent.y - STEP && y + a.height <= extent.y + extent.h + STEP) out.push({ side, x, y });
  }
  return out;
}

/** Mean height of the targets inside each boundary: an actor level with a group reaches it without crossing the others. */
function groupMids(targets: string[], boundaries: BoundaryInfo[], abs: (id: string) => Rect): number[] {
  return boundaries.flatMap(b => {
    const ts = targets.filter(t => b.caseIds.has(t));
    return ts.length ? [ts.reduce((s, t) => s + abs(t).y + abs(t).h / 2, 0) / ts.length] : [];
  });
}

/** y of the free band between each pair of vertically adjacent boundaries. */
function gapCentres(boundaries: BoundaryInfo[]): number[] {
  const sorted = [...boundaries].sort((a, b) => a.rect.y - b.rect.y);
  return sorted.slice(1).map((b, i) => (sorted[i].rect.y + sorted[i].rect.h + b.rect.y) / 2);
}

/** True when the actor (with its label) would overlap an already placed one on the same side. */
function collides(side: Side, y: number, h: number, placed: Placed[]): boolean {
  return placed.some(p => p.side === side && y < p.y + p.h + LABEL_ROOM + STACK_GAP && p.y < y + h + LABEL_ROOM + STACK_GAP);
}

/**
 * Place every actor.
 * @param extent - rect enclosing all use cases / boundaries
 * @param abs - absolute rect of a use case
 * @param primary - the actor already fixed at the arc centre, if any
 * @param boundaries - system boundaries with the use cases they own
 */
export function placeActors(
  ctx: Ctx, extent: Rect, abs: (id: string) => Rect, primary: { node: DiagramNode; at: Point } | undefined, boundaries: BoundaryInfo[],
): Map<string, Point> {
  const out = new Map<string, Point>();
  const placed: Placed[] = [];
  const scene: Scene = { abs, cases: ctx.model.cases.map(c => ({ id: c.id, ellipse: isEllipseStyle(c.style) })), boundaries };
  const gaps = gapCentres(boundaries);
  const lines: Line[] = [];
  if (primary) {
    out.set(primary.node.id, primary.at);
    placed.push({ side: 'left', y: primary.at.y, h: primary.node.height });
    const centre = { x: primary.at.x + primary.node.width / 2, y: primary.at.y + primary.node.height / 2 };
    lines.push(...linesFrom(centre, targetsOf(ctx, primary.node.id), abs));
  }
  const degree = (a: DiagramNode): number => ctx.edges.filter(e => e.sourceId === a.id || e.targetId === a.id).length;
  const rest = ctx.model.actors.filter(a => a.id !== primary?.node.id).sort((a, b) => degree(b) - degree(a));
  for (const a of rest) {
    const targets = targetsOf(ctx, a.id);
    const mids = targets.map(t => abs(t).y + abs(t).h / 2);
    const mid = mids.length ? (Math.min(...mids) + Math.max(...mids)) / 2 : extent.y + extent.h / 2;
    let best: { side: Side; x: number; y: number; cost: number } | null = null;
    for (const c of candidates(a, mid, extent, [...gaps, ...groupMids(targets, boundaries, abs)])) {
      if (collides(c.side, c.y, a.height, placed)) continue;
      const from = { x: c.x + a.width / 2, y: c.y + a.height / 2 };
      const crossings = linesFrom(from, targets, abs).reduce((n, l) => n + lines.filter(o => properlyCross(l, o)).length, 0);
      const cost = lineCost(from, targets, scene) + CROSS_COST * crossings + (c.side === 'left' ? 0 : 1); // tie → left
      if (!best || cost < best.cost) best = { ...c, cost };
    }
    const pick = best ?? fallback(a, extent, placed);
    out.set(a.id, { x: pick.x, y: pick.y });
    placed.push({ side: pick.side, y: pick.y, h: a.height });
    lines.push(...linesFrom({ x: pick.x + a.width / 2, y: pick.y + a.height / 2 }, targets, abs));
  }
  return out;
}

/** No collision-free candidate: stack below everything on the right. */
function fallback(a: DiagramNode, extent: Rect, placed: Placed[]): { side: Side; x: number; y: number } {
  const bottom = Math.max(extent.y, ...placed.filter(p => p.side === 'right').map(p => p.y + p.h + LABEL_ROOM + STACK_GAP));
  return { side: 'right', x: extent.x + extent.w + ACTOR_GAP, y: bottom };
}
