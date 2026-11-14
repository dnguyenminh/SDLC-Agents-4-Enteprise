/**
 * SA4E-406 — the use-case column of a use-case diagram: row positions and the
 * arc that keeps every association line clear of the neighbouring ellipses.
 */

import { isEllipseStyle, type UseCaseGroup, type UseCaseModel } from './drawio-detect-usecase';
import type { DiagramEdge } from './drawio-parser';

/** Model + edges shared by the use-case planning steps. */
export interface Ctx { model: UseCaseModel; edges: DiagramEdge[]; caseIds: Set<string>; actorIds: Set<string>; }

const ROW_GAP = 40;
/** Space between two system boundaries (or a boundary and loose use cases). */
const GROUP_GAP = 40;
/** Steepest fan angle from the horizontal; flatter fans need a wider diagram. */
const MAX_FAN_ANGLE = Math.PI / 3;

/** Vertical extent of one group of use cases (the boundary's frame when it has one). */
export interface GroupSpan { top: number; bottom: number; }

/**
 * Use case rows in document order, group by group. A group with a boundary gets
 * the boundary's title/bottom padding around its cases; groups are separated by a gap.
 * @param topPadOf - space between a boundary's top and its first use case
 * @param bottomPad - space between a boundary's last use case and its bottom
 * @returns top y per case, the extent of each group, and the bottom of the last group
 */
export function caseRows(
  ctx: Ctx, topPadOf: (g: UseCaseGroup) => number, bottomPad: number,
): { ys: Map<string, number>; spans: GroupSpan[]; bottom: number } {
  const ys = new Map<string, number>();
  const spans: GroupSpan[] = [];
  let cursor = 0;
  for (const g of ctx.model.groups) {
    const framed = g.boundary !== undefined;
    let y = cursor + (framed ? topPadOf(g) : 0);
    for (const c of g.cases) { ys.set(c.id, y); y += c.height + ROW_GAP; }
    const bottom = y - ROW_GAP + (framed ? bottomPad : 0);
    spans.push({ top: cursor, bottom });
    cursor = bottom + GROUP_GAP;
  }
  return { ys, spans, bottom: spans[spans.length - 1].bottom };
}
/**
 * Horizontal offset of each use case so the column bends into an arc around the
 * primary actor's centre. Every association is then a radius that reaches its
 * own ellipse (left vertex on the circle) before any other: all ellipses lie
 * outside the circle, so no line can cut one. Without a primary actor the
 * column is straight and centred.
 * @param actorCy - centre y of the primary actor relative to the boundary, or null
 * @param minReach - smallest allowed distance from the actor centre to the column
 * @returns offset per case (≥ 0) and the actor centre's distance left of the column
 */
export function fanOffsets(
  ctx: Ctx, ys: Map<string, number>, actorCy: number | null, minReach: number,
): { off: Map<string, number>; reach: number } {
  const cases = ctx.model.cases;
  if (actorCy === null) {
    const colW = Math.max(...cases.map(c => c.width));
    return { off: new Map(cases.map(c => [c.id, (colW - c.width) / 2])), reach: minReach };
  }
  const dy = (id: string, h: number): number => ys.get(id)! + h / 2 - actorCy;
  const dyMax = Math.max(...cases.map(c => Math.abs(dy(c.id, c.height))));
  const radius = Math.max(dyMax / Math.sin(MAX_FAN_ANGLE), Math.hypot(dyMax, minReach));
  // An ellipse's nearest point to the actor is its left vertex (at centre height); a box's is its nearest corner
  const nearDy = (c: UseCaseModel['cases'][number]): number =>
    isEllipseStyle(c.style) ? Math.abs(dy(c.id, c.height)) : Math.max(0, Math.abs(dy(c.id, c.height)) - c.height / 2);
  const across = new Map(cases.map(c => [c.id, Math.sqrt(radius ** 2 - nearDy(c) ** 2)]));
  const reach = Math.min(...across.values());
  return { off: new Map(cases.map(c => [c.id, across.get(c.id)! - reach])), reach };
}

/**
 * Height of the primary actor. Normally the centre of the use cases it is associated with; when they
 * lie in several system boundaries, the gap between two boundaries that splits them most evenly
 * (a line from a gap reaches either neighbour without crossing the other boundary).
 */
export function primaryCentre(ctx: Ctx, actorId: string, ys: Map<string, number>, spans: GroupSpan[]): number | null {
  const own = linkedCentre(ctx, actorId, ys);
  if (own === null || spans.length < 2) return own;
  const groupOf = new Map(ctx.model.groups.flatMap((g, i) => g.cases.map(c => [c.id, i] as const)));
  const hit = ctx.edges.flatMap(e => (e.sourceId === actorId ? [e.targetId] : e.targetId === actorId ? [e.sourceId] : []))
    .filter(id => groupOf.has(id)).map(id => groupOf.get(id)!);
  if (new Set(hit).size < 2) return own;
  const gaps = spans.slice(1).map((s, i) => ({ y: (spans[i].bottom + s.top) / 2, skew: Math.abs(hit.filter(g => g <= i).length - hit.filter(g => g > i).length) }));
  return gaps.sort((a, b) => a.skew - b.skew || Math.abs(a.y - own) - Math.abs(b.y - own))[0].y;
}

/** Centre y (relative) of the cases an actor is associated with; null when it has none. */
export function linkedCentre(ctx: Ctx, actorId: string, ys: Map<string, number>): number | null {
  const byId = new Map(ctx.model.cases.map(c => [c.id, c]));
  const linked = ctx.edges.flatMap(e => (e.sourceId === actorId ? [e.targetId] : e.targetId === actorId ? [e.sourceId] : []))
    .filter(id => byId.has(id)).map(id => ys.get(id)! + byId.get(id)!.height / 2);
  return linked.length ? (Math.min(...linked) + Math.max(...linked)) / 2 : null;
}
