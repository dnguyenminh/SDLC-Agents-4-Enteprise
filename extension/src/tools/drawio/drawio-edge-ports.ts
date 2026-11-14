/**
 * SA4E-406 — port assignment for routed edges.
 *
 * For every edge end picks the side of the node that faces the other end
 * (the axis with the larger clear gap wins, so left-to-right flows exit right
 * and enter left), then spreads the ends that share a side evenly along it,
 * ordered by where their far end lies so fans do not cross themselves.
 * Single-attachment shapes (diamonds, ellipses) take at most one edge per
 * side: extra edges move to the next free side instead of stacking.
 */

import type { DiagramEdge, DiagramNode } from './drawio-parser';
import type { Rect } from './drawio-geometry';
import type { Dir } from './drawio-grid-router';

export interface PortAssignment { side: Dir; frac: number; }
export interface EdgePorts { exit: PortAssignment; entry: PortAssignment; }
export type PortSideOverrides = ReadonlyMap<string, Partial<Record<'exit' | 'entry', Dir>>>;

interface End {
  edge: DiagramEdge;
  role: 'exit' | 'entry';
  nodeId: string;
  /** Rect of the node this end belongs to. */
  self: Rect;
  far: Rect;
  side: Dir;
  /** Cross-axis coordinate this end's routed edge actually heads to (2nd pass only). */
  hint?: number;
}

/** Shapes whose outline offers one natural attachment point per side. */
const SINGLE_PORT = /\b(rhombus|ellipse|triangle|hexagon|cloud)\b/;

/** Assign side + fraction to both ends of every edge. */
export function assignPorts(
  edges: DiagramEdge[], cells: Map<string, DiagramNode>, rects: Map<string, Rect>,
  hints?: Map<string, number>, overrides?: PortSideOverrides,
): Map<string, EdgePorts> {
  const ends = edges.flatMap(e => makeEnds(e, rects, hints, overrides));
  relocateSinglePortShapes(ends, cells);
  const fracs = spreadAlongSides(ends, cells);
  const out = new Map<string, EdgePorts>();
  for (const e of edges) {
    const exit = ends.find(x => x.edge === e && x.role === 'exit')!;
    const entry = ends.find(x => x.edge === e && x.role === 'entry')!;
    out.set(e.id, {
      exit: { side: exit.side, frac: fracs.get(exit)! },
      entry: { side: entry.side, frac: fracs.get(entry)! },
    });
  }
  return out;
}

function makeEnds(
  edge: DiagramEdge, rects: Map<string, Rect>, hints?: Map<string, number>, overrides?: PortSideOverrides,
): End[] {
  const s = rects.get(edge.sourceId)!, t = rects.get(edge.targetId)!;
  const [facingExit, facingEntry] = facingSides(s, t);
  const override = overrides?.get(edge.id);
  return [
    { edge, role: 'exit', nodeId: edge.sourceId, self: s, far: t, side: override?.exit ?? facingExit, hint: hints?.get(`${edge.id}|exit`) },
    { edge, role: 'entry', nodeId: edge.targetId, self: t, far: s, side: override?.entry ?? facingEntry, hint: hints?.get(`${edge.id}|entry`) },
  ];
}

/** [side of `s` facing `t`, side of `t` facing `s`]. */
export function facingSides(s: Rect, t: Rect): [Dir, Dir] {
  const gapX = Math.max(t.x - (s.x + s.w), s.x - (t.x + t.w));
  const gapY = Math.max(t.y - (s.y + s.h), s.y - (t.y + t.h));
  const horizontal = gapX > 0 && gapX >= gapY ? true
    : gapY > 0 ? false
      : Math.abs(t.x + t.w / 2 - (s.x + s.w / 2)) >= Math.abs(t.y + t.h / 2 - (s.y + s.h / 2));
  if (horizontal) return t.x + t.w / 2 >= s.x + s.w / 2 ? [0, 2] : [2, 0];
  return t.y + t.h / 2 >= s.y + s.h / 2 ? [1, 3] : [3, 1];
}

/**
 * Single-port shapes (diamonds…): at most one end per side. With 2–4 ends the
 * ends are sorted by the angle of their far end and mapped onto sides in the
 * same cyclic order, choosing the mapping with the smallest total angular
 * mismatch — so a diamond's three outputs leave up / right / down in the
 * order of their targets and never cross each other. More than four ends keep
 * their facing side and share it.
 */
function relocateSinglePortShapes(ends: End[], cells: Map<string, DiagramNode>): void {
  const byNode = new Map<string, End[]>();
  for (const e of ends) byNode.set(e.nodeId, [...(byNode.get(e.nodeId) ?? []), e]);
  for (const [nodeId, list] of byNode) {
    if (list.length < 2 || list.length > 4) continue;
    if (SINGLE_PORT.test(cells.get(nodeId)?.style ?? '')) assignByAngle(list);
  }
}

function assignByAngle(list: End[]): void {
  const sorted = [...list].sort((a, b) => angleOf(a) - angleOf(b));
  let best = { cost: Infinity, sides: [] as Dir[] };
  for (const subset of sideSubsets(sorted.length)) {
    for (let shift = 0; shift < subset.length; shift++) {
      const sides = sorted.map((_, i) => subset[(i + shift) % subset.length]);
      const cost = sorted.reduce((sum, e, i) => sum + angularGap(angleOf(e), sides[i] * 90), 0);
      if (cost < best.cost) best = { cost, sides };
    }
  }
  sorted.forEach((e, i) => { e.side = best.sides[i]; });
}

/** Direction to the far end in degrees, clockwise from +x (screen axes), 0..360. */
function angleOf(e: End): number {
  const dx = e.far.x + e.far.w / 2 - (e.self.x + e.self.w / 2);
  const dy = e.far.y + e.far.h / 2 - (e.self.y + e.self.h / 2);
  return (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
}

function angularGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** All k-element subsets of the four sides, each in ascending side order. */
function sideSubsets(k: number): Dir[][] {
  const out: Dir[][] = [];
  for (let mask = 1; mask < 16; mask++) {
    const sides = ([0, 1, 2, 3] as Dir[]).filter(d => mask & (1 << d));
    if (sides.length === k) out.push(sides);
  }
  return out;
}
/** Evenly spread ends sharing (node, side); order by far-end cross coordinate. */
function spreadAlongSides(ends: End[], cells: Map<string, DiagramNode>): Map<End, number> {
  const groups = new Map<string, End[]>();
  for (const e of ends) {
    const key = `${e.nodeId}|${e.side}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const fracs = new Map<End, number>();
  for (const list of groups.values()) {
    const single = SINGLE_PORT.test(cells.get(list[0].nodeId)?.style ?? '');
    list.sort(portOrder);
    list.forEach((e, i) => fracs.set(e, sideFraction(i, list.length, single)));
  }
  return fracs;
}

/**
 * Fraction of the i-th of n ends along a side. Rectangles spread over the whole
 * side; single-port shapes sit on the vertex (0.5) and only fan out narrowly
 * around it when more than one end is forced onto the same side.
 */
function sideFraction(i: number, n: number, singlePort: boolean): number {
  if (!singlePort) return Math.round(((i + 1) / (n + 1)) * 100) / 100;
  return n === 1 ? 0.5 : Math.round((0.3 + (0.4 * i) / (n - 1)) * 100) / 100;
}

/** Far ends closer than this along the side count as level (px). */
const LEVEL_TOLERANCE = 20;

/**
 * Order of ends along a side. By far-end position first; for level ends the
 * nearer one takes the port on the side it turns toward (far ends below →
 * lower port, above → upper port), otherwise its first bend would cut across
 * the longer edge leaving from the other port.
 */
function portOrder(a: End, b: End): number {
  if (a.hint !== undefined && b.hint !== undefined && Math.abs(a.hint - b.hint) >= 1) return a.hint - b.hint;
  const diff = cross(a) - cross(b);
  if (Math.abs(diff) >= LEVEL_TOLERANCE) return diff;
  const turnsToward = cross(a) >= selfCross(a) ? -1 : 1;
  return turnsToward * (reach(a) - reach(b)) || a.edge.id.localeCompare(b.edge.id);
}

/** Own-node centre on the cross axis of the chosen side. */
function selfCross(e: End): number {
  return e.side % 2 === 0 ? e.self.y + e.self.h / 2 : e.self.x + e.self.w / 2;
}

/** Distance from the node centre to the far end along the side's normal axis. */
function reach(e: End): number {
  return e.side % 2 === 0
    ? Math.abs(e.far.x + e.far.w / 2 - (e.self.x + e.self.w / 2))
    : Math.abs(e.far.y + e.far.h / 2 - (e.self.y + e.self.h / 2));
}

/** Far-end coordinate along the side (y for left/right sides, x for top/bottom). */
function cross(e: End): number {
  return e.side % 2 === 0 ? e.far.y + e.far.h / 2 : e.far.x + e.far.w / 2;
}
