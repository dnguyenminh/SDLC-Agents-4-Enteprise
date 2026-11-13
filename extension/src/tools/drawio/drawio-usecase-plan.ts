/**
 * SA4E-406 — geometry plan for a UML use-case diagram.
 *
 * Human layout: the use cases in a column inside the system boundary (document
 * order, which is how authors number them), the primary actor (most
 * associations) on the left, further actors alternating right/left, each beside
 * the use cases it is associated with. Associations are straight lines: from
 * one actor to a column they fan out without crossing each other. Include /
 * extend arrows between neighbouring use cases go straight down; longer ones
 * detour along the side of the column that carries fewer associations.
 *
 * Pure planning — no XML writing (see drawio-usecase-xml).
 */

import type { UseCaseGroup, UseCaseModel } from './drawio-detect-usecase';
import type { DiagramEdge, DiagramNode } from './drawio-parser';
import type { Point, Rect } from './drawio-geometry';
import { containerInsets, titleOnTop } from './drawio-container-insets';
import { rewriteStyle } from './drawio-style';
import { placeActors } from './drawio-usecase-actors';
import { caseRows, fanOffsets, primaryCentre, type Ctx, type GroupSpan } from './drawio-usecase-column';

/** Include/extend arrow between two use cases. */
export interface RelationPlan { id: string; straight: boolean; points: Point[]; side: 'left' | 'right'; }
/** A system boundary with its final rect and (possibly re-oriented) style. */
export interface BoundaryPlan { id: string; rect: Rect; style: string; }
export interface UseCasePlan {
  /** System boundaries, absolute rects. */
  boundaries: BoundaryPlan[];
  /** Use case top-left in the space of its parent: relative to its boundary, absolute when it has none. */
  cases: Map<string, Point>;
  /** Actors and other top-level shapes, absolute top-left. */
  roots: Map<string, Point>;
  associations: string[];
  relations: RelationPlan[];
}
const MARGIN = 40;
const PLAIN_TITLE_ROOM = 44; // a plain rectangle carries its title as a label at the top: keep the first use case below it
const PAD = 30; // boundary padding around the column (beyond the title strip)
const ACTOR_GAP = 160; // room for the association fan between actor and boundary
const DETOUR_GAP = 24; // first detour lane from the widest use case
const DETOUR_STEP = 14; // between parallel detour lanes
const OTHERS_GAP = 40;

/** Actor sides: most associated first on the left, then alternate right / left. */
function actorSides(ctx: Ctx): Map<string, 'left' | 'right'> {
  const degree = (a: DiagramNode): number => ctx.edges.filter(e => e.sourceId === a.id || e.targetId === a.id).length;
  const sorted = [...ctx.model.actors].sort((a, b) => degree(b) - degree(a));
  return new Map(sorted.map((a, i) => [a.id, i % 2 === 0 ? 'left' : 'right']));
}

/** Side of the column with fewer associations (detours go there). */
function detourSide(sides: Map<string, 'left' | 'right'>, ctx: Ctx): 'left' | 'right' {
  const count = (s: 'left' | 'right'): number => ctx.edges.filter(e =>
    sides.get(e.sourceId) === s || sides.get(e.targetId) === s).length;
  return count('right') <= count('left') ? 'right' : 'left';
}

/** Relations between use cases that are not neighbours in the column (they need a detour lane). */
function detourCount(ctx: Ctx): number {
  const order = new Map(ctx.model.cases.map((c, i) => [c.id, i]));
  return ctx.edges.filter(e => ctx.caseIds.has(e.sourceId) && ctx.caseIds.has(e.targetId)
    && Math.abs(order.get(e.sourceId)! - order.get(e.targetId)!) !== 1).length;
}

/** Relations between use cases; neighbours straight, others on detour lanes. */
function planRelations(ctx: Ctx, abs: (id: string) => Rect, side: 'left' | 'right', colEdge: number): RelationPlan[] {
  const order = new Map(ctx.model.cases.map((c, i) => [c.id, i]));
  const rel = ctx.edges.filter(e => ctx.caseIds.has(e.sourceId) && ctx.caseIds.has(e.targetId));
  let lane = 0;
  return rel.map(e => {
    if (Math.abs(order.get(e.sourceId)! - order.get(e.targetId)!) === 1) return { id: e.id, straight: true, points: [], side };
    const x = side === 'right' ? colEdge + DETOUR_GAP + lane * DETOUR_STEP : colEdge - DETOUR_GAP - lane * DETOUR_STEP;
    lane++;
    const [a, b] = [abs(e.sourceId), abs(e.targetId)];
    return { id: e.id, straight: false, side, points: [{ x, y: a.y + a.h / 2 }, { x, y: b.y + b.h / 2 }] };
  });
}

/**
 * Plan the layout of a use-case diagram.
 * @param model - structure from detectUseCaseDiagram
 * @param edges - all edges of the diagram
 */
export function planUseCase(model: UseCaseModel, edges: DiagramEdge[]): UseCasePlan {
  const ctx: Ctx = { model, edges, caseIds: new Set(model.cases.map(c => c.id)), actorIds: new Set(model.actors.map(a => a.id)) };
  const sides = actorSides(ctx);
  const actorOnLeft = [...sides.values()].includes('left');
  const styleOf = (g: UseCaseGroup): string => titleStyle(g.boundary!.style, actorOnLeft);
  const insets = model.groups.filter(g => g.boundary).map(g => containerInsets(styleOf(g)));
  const leftPad = Math.max(PAD, ...insets.map(i => i.left));
  const side = detourSide(sides, ctx);
  const detours = detourCount(ctx);
  const detourRoom = detours ? DETOUR_GAP + detours * DETOUR_STEP : 0;
  const colLeft = leftPad + (side === 'left' ? detourRoom : 0);
  const { ys, spans, bottom } = caseRows(ctx, g => Math.max(PAD, containerInsets(styleOf(g)).top, g.nested ? 0 : PLAIN_TITLE_ROOM), PAD);
  // primary actor = most associations (first in side order); the column bends around it
  const primary = model.actors.find(a => a.id === [...sides.keys()][0]);
  const actorCy = primary ? primaryCentre(ctx, primary.id, ys, spans) : null;
  const minReach = primary ? colLeft + ACTOR_GAP + primary.width / 2 : 0;
  const { off, reach } = fanOffsets(ctx, ys, actorCy, minReach);
  const local = new Map(model.cases.map(c => [c.id, { x: colLeft + off.get(c.id)!, y: ys.get(c.id)! }]));
  const colRight = Math.max(...model.cases.map(c => local.get(c.id)!.x + c.width));
  const width = colRight + PAD + (side === 'right' ? detourRoom : 0);
  // actor centre sits `reach` left of the column: put the actor's left edge on the margin
  const origin: Point = { x: primary && actorCy !== null ? MARGIN + primary.width / 2 + reach - colLeft : MARGIN, y: MARGIN };
  const boundaries = planBoundaries(model, spans, origin, width, styleOf);
  const byId = new Map(model.cases.map(c => [c.id, c]));
  const abs = (id: string): Rect => ({ x: origin.x + local.get(id)!.x, y: origin.y + local.get(id)!.y, w: byId.get(id)!.width, h: byId.get(id)!.height });
  const relations = planRelations(ctx, abs, side, origin.x + (side === 'right' ? colRight : colLeft));
  const extent: Rect = { x: origin.x, y: origin.y, w: width, h: bottom };
  const fixed = primary && actorCy !== null
    ? { node: primary, at: { x: MARGIN, y: origin.y + actorCy - primary.height / 2 } } : undefined;
  const owned = boundaries.map(b => ({ rect: b.rect, caseIds: new Set(model.groups.find(g => g.boundary?.id === b.id)!.cases.map(c => c.id)) }));
  const roots = placeActors(ctx, extent, abs, fixed, owned);
  placeOthers(model.others, extent, roots, model.actors).forEach((p, id) => roots.set(id, p));
  const associations = edges.filter(e => ctx.actorIds.has(e.sourceId) || ctx.actorIds.has(e.targetId)).map(e => e.id);
  return { boundaries, cases: parentSpace(model, local, boundaries, origin), roots, associations, relations };
}

/** Boundary rects: all as wide as the column, each as tall as its group. */
function planBoundaries(
  model: UseCaseModel, spans: GroupSpan[], origin: Point, width: number, styleOf: (g: UseCaseGroup) => string,
): BoundaryPlan[] {
  return model.groups.flatMap((g, i) => g.boundary
    ? [{ id: g.boundary.id, style: styleOf(g), rect: { x: origin.x, y: origin.y + spans[i].top, w: width, h: spans[i].bottom - spans[i].top } }]
    : []);
}

/** Convert layout-space positions to the space of each use case's parent. */
function parentSpace(model: UseCaseModel, local: Map<string, Point>, boundaries: BoundaryPlan[], origin: Point): Map<string, Point> {
  const out = new Map<string, Point>();
  model.groups.forEach(g => {
    // children of the boundary cell use ITS space; use cases merely drawn inside a rectangle sit on the page
    const b = g.boundary && g.nested ? boundaries.find(x => x.id === g.boundary!.id)!.rect : { x: 0, y: 0 };
    for (const c of g.cases) out.set(c.id, { x: origin.x + local.get(c.id)!.x - b.x, y: origin.y + local.get(c.id)!.y - b.y });
  });
  return out;
}
/**
 * A title strip on the left (`horizontal=0`) faces the primary actor: every
 * association would strike through the system name. Move it to the top.
 */
function titleStyle(style: string, actorOnLeft: boolean): string {
  return actorOnLeft && !titleOnTop(style) ? rewriteStyle(style, new Set(['horizontal']), []) : style;
}

/** Notes and legends in a row under everything else. */
function placeOthers(others: DiagramNode[], boundary: Rect, actors: Map<string, Point>, actorNodes: DiagramNode[]): Map<string, Point> {
  const bottoms = actorNodes.map(a => actors.get(a.id)!.y + a.height);
  let x = MARGIN;
  const y = Math.max(boundary.y + boundary.h, ...bottoms) + OTHERS_GAP;
  return new Map(others.map(o => { const p = { x, y }; x += o.width + OTHERS_GAP; return [o.id, p]; }));
}
