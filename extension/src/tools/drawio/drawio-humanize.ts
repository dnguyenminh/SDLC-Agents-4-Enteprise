/**
 * SA4E-406 — humanize layout strategy.
 *
 * Plain ELK layered + DOWN stacks everything into tall narrow columns; a
 * person lays a band out left-to-right and arranges the bands as an aligned,
 * flow-ordered grid. This strategy works bottom-up over the container tree:
 *
 *   1. Every container's interior is laid out first (recursively), giving it
 *      a real size = children bounding box + swimlane padding.
 *   2. Each level then positions its direct children with a FLAT ELK run.
 *      Edges are "lifted" to that level: an edge between two deep nodes becomes
 *      an edge between the two direct children that contain them, so
 *      cross-band flow still orders the bands.
 *   3. The root level packs bands in a flow-ordered grid (see
 *      drawio-humanize-pack); a diagram without containers is just one flat run.
 *
 * Output is a synthetic ELK tree (container children use parent-relative
 * coordinates, root children absolute) consumed unchanged by applyLayoutToXml.
 * Edge routes are NOT produced here — drawio-edge-plan routes them afterwards
 * from the final geometry.
 */

import type { DiagramGraph, DiagramNode } from './drawio-parser';
import type { ElkNode, NormalizedArgs } from './drawio-layout-models';
import type { Pair } from './drawio-humanize-elk';
import { containerInsets } from './drawio-container-insets';
import { WRAP_MIN_NODES } from './drawio-detect-aspect';
import { detectLanes, layoutLanes } from './drawio-humanize-lanes';
import { detectArrangement, orderAlong, type Arrangement } from './drawio-arrangement';
import { chooseColumns, orderByFlow, packGrid, packShelves, shelfWidth } from './drawio-humanize-pack';
import {
  ROOT, ROOT_PAD, elkPositions, isRowList, isStrip, levelBounds, shelveOrphans, stackLevel,
  type Ctx, type Level,
} from './drawio-humanize-level';
/** Humanized layout of the whole diagram as a synthetic laid-out ELK tree. */
export async function humanizeLayout(graph: DiagramGraph, args: NormalizedArgs, timeoutMs = 30_000): Promise<ElkNode> {
  // Swimlane flows (actors as lanes, hand-offs across them) get their own strategy
  const lanes = detectLanes(graph, args);
  if (lanes) return layoutLanes(graph, lanes, args, timeoutMs);
  const ctx = buildCtx(graph, args, timeoutMs);
  const level = await layoutLevel(ctx, ROOT);
  return { id: 'root', x: 0, y: 0, width: level.width, height: level.height, children: level.nodes, edges: [] };
}

function buildCtx(graph: DiagramGraph, args: NormalizedArgs, timeoutMs: number): Ctx {
  const cells = new Map([...graph.nodes, ...graph.containers].map(c => [c.id, c]));
  const kids = new Map<string, DiagramNode[]>();
  for (const c of [...graph.containers, ...graph.nodes]) {
    const key = parentKey(cells, c);
    kids.set(key, [...(kids.get(key) ?? []), c]);
  }
  return { graph, args, timeoutMs, cells, kids };
}

function parentKey(cells: Map<string, DiagramNode>, c: DiagramNode): string {
  return cells.has(c.parentId) ? c.parentId : ROOT;
}

/** Lay out the direct children of `key`; returns the level's size and children. */
async function layoutLevel(ctx: Ctx, key: string): Promise<Level> {
  const items = await sizedChildren(ctx, key);
  const pairs = liftedPairs(ctx, key);
  const hasBands = items.some(i => (i.children?.length ?? 0) > 0);
  if (key === ROOT && hasBands) return packRoot(ctx, items, pairs);
  if (key !== ROOT && isRowList(ctx, items, pairs)) return stackLevel(ctx, items, key);
  return flowLevel(ctx, items, pairs, key);
}

/** Direct children as ELK nodes; containers are laid out first to obtain their size. */
async function sizedChildren(ctx: Ctx, key: string): Promise<ElkNode[]> {
  const out: ElkNode[] = [];
  for (const kid of ctx.kids.get(key) ?? []) {
    if (kid.isContainer && ctx.kids.has(kid.id)) {
      const sub = await layoutLevel(ctx, kid.id);
      out.push({ id: kid.id, width: sub.width, height: sub.height, children: sub.nodes, edges: [] });
    } else {
      out.push({ id: kid.id, width: Math.max(kid.width, 1), height: Math.max(kid.height, 1) });
    }
  }
  return out;
}

/** Edges lifted to the children of `key` (endpoints → their direct-child ancestor), deduplicated. */
function liftedPairs(ctx: Ctx, key: string): Pair[] {
  const seen = new Set<string>();
  const out: Pair[] = [];
  for (const e of ctx.graph.edges) {
    const a = liftTo(ctx, e.sourceId, key), b = liftTo(ctx, e.targetId, key);
    if (!a || !b || a === b || seen.has(`${a}>${b}`)) continue;
    seen.add(`${a}>${b}`);
    out.push([a, b]);
  }
  return out;
}

/** Ancestor-or-self of `id` whose parent is `key`; null when `id` lies outside that subtree. */
function liftTo(ctx: Ctx, id: string, key: string): string | null {
  const seen = new Set<string>();
  for (let cur: string = id; !seen.has(cur); ) {
    seen.add(cur);
    const cell = ctx.cells.get(cur);
    if (!cell) return null;
    const pk = parentKey(ctx.cells, cell);
    if (pk === key) return cur;
    if (pk === ROOT) return null;
    cur = pk;
  }
  return null;
}

/** One flat ELK run: interior of a container (RIGHT by default) or a container-free root. */
async function flowLevel(ctx: Ctx, items: ElkNode[], pairs: Pair[], key: string): Promise<Level> {
  const isRoot = key === ROOT;
  const explicit = ctx.args.directionExplicit === true;
  const dir = isRoot || explicit ? ctx.args.direction : 'RIGHT';
  // Nodes with no edge at this level would each become a tall layer-0 column and
  // block the routes of the real flow: lay the flow out alone, shelve the rest.
  // A level with NO internal pairs keeps all of its children in the flow —
  // shelving them would empty it (SA4E-406: edge-less containers lost everything).
  const linked = new Set(pairs.flat());
  const orphans = pairs.length > 0 ? readingOrder(ctx, items.filter(i => !linked.has(i.id))) : [];
  const flow = items.filter(i => !orphans.includes(i));
  let pos = await elkPositions(ctx, flow, pairs, dir);
  // A long chain laid out as one strip (20 steps → 1:20) is unreadable: wrap it
  if (flow.length >= WRAP_MIN_NODES && isStrip(flow, pos)) pos = await elkPositions(ctx, flow, pairs, dir, true);
  const pad = isRoot ? ROOT_PAD : containerInsets(ctx.cells.get(key)?.style ?? '');
  // Authors often draw children flush with the borders: reserve BOTH insets for the shelf
  const drawnWidth = isRoot ? 0 : (ctx.cells.get(key)?.width ?? 0) - pad.left - pad.right;
  // The shelf coordinates carry the insets — flow gets the pad, orphans do not
  shelveOrphans(orphans, flow, pos, pad, drawnWidth);
  for (const n of flow) {
    const p = pos.get(n.id) ?? { x: 0, y: 0 };
    n.x = p.x + pad.left;
    n.y = p.y + pad.top;
  }
  for (const n of orphans) {
    const p = pos.get(n.id) ?? { x: 0, y: 0 };
    n.x = p.x;
    n.y = p.y;
  }
  return levelBounds(items, pad, isRoot);
}

/** Row tolerance of the author's reading order (px). */
const ROW_TOL = 20;

/** Nodes in the author's reading order (rows top→bottom, then left→right; 20px row tolerance). */
function readingOrder(ctx: Ctx, nodes: ElkNode[]): ElkNode[] {
  const at = (n: ElkNode) => ctx.cells.get(n.id) ?? { x: 0, y: 0 };
  const sorted = [...nodes].sort((a, b) => at(a).y - at(b).y || at(a).x - at(b).x);
  // Band into rows: a node joins the current row while its y stays within
  // ROW_TOL of the row's anchor (round(y/20) split y=9 vs y=11 apart).
  const rows: ElkNode[][] = [];
  for (const n of sorted) {
    const last = rows[rows.length - 1];
    if (last && at(n).y - at(last[0]).y <= ROW_TOL) last.push(n);
    else rows.push([n]);
  }
  return rows.flat();
}

/** Root packing of bands (and loose nodes) in flow order on an aligned grid. */
function packRoot(ctx: Ctx, items: ElkNode[], pairs: Pair[]): Level {
  const byId = new Map(items.map(i => [i.id, i]));
  const explicit = ctx.args.directionExplicit ? ctx.args.direction : undefined;
  const kept = explicit ? null : keptArrangement(ctx, items, pairs);
  if (kept) return packKept(ctx, items, byId, kept);
  const ordered = orderByFlow(items.map(i => i.id), pairs).map(id => byId.get(id)!);
  // Default: flow-ordered shelves as wide as the widest band; an explicit direction keeps a strict row/column
  const placements = explicit
    ? packGrid(ordered, chooseColumns(ordered, pairs.length > 0, explicit))
    : packShelves(ordered, shelfWidth(ordered));
  for (const p of placements) {
    const n = byId.get(p.id)!;
    n.x = p.x;
    n.y = p.y;
  }
  return levelBounds(ordered, { ...ROOT_PAD, left: 0, top: 0 }, true);
}

/**
 * The row/column the author drew the root boxes in, judged on their ORIGINAL
 * geometry. Only boxes that are the DIRECT endpoint of an edge are
 * disqualified (their relation orders them, e.g. UML classes) — edges between
 * box CONTENTS do not disqualify their bands, and the diagram as a whole is
 * never voided (SA4E-406: one stray edge made keptArrangement dead code).
 */
function keptArrangement(
  ctx: Ctx, items: ElkNode[], _pairs: Pair[],
): { arrangement: Arrangement; order: string[] } | null {
  const boxes = items.map(i => ctx.cells.get(i.id)).filter((c): c is DiagramNode => c !== undefined);
  if (boxes.length !== items.length) return null;
  const ids = new Set(items.map(i => i.id));
  const joined = new Set<string>();
  for (const e of ctx.graph.edges) {
    if (ids.has(e.sourceId)) joined.add(e.sourceId);
    if (ids.has(e.targetId)) joined.add(e.targetId);
  }
  const kept = boxes.filter(b => !joined.has(b.id));
  if (kept.length < 2) return null;
  const arrangement = detectArrangement(kept);
  if (!arrangement) return null;
  const rootPairs: Pair[] = ctx.graph.edges
    .filter(e => ids.has(e.sourceId) && ids.has(e.targetId))
    .map(e => [e.sourceId, e.targetId]);
  const restIds = boxes.filter(b => joined.has(b.id)).map(b => b.id);
  return { arrangement, order: [...orderAlong(kept, arrangement), ...orderByFlow(restIds, rootPairs)] };
}

/**
 * Re-pack root boxes in the author's row/column and order. Bands in a column
 * share the widest width (a row: the tallest height) so layer stacks stay
 * aligned. SA4E-406: the stretch used to strand the interior children at the
 * old content edge ("giant band, children in the corner") — after stretching,
 * interiors that filled the old extent are spread over the new one.
 */
function packKept(
  ctx: Ctx, items: ElkNode[], byId: Map<string, ElkNode>, kept: { arrangement: Arrangement; order: string[] },
): Level {
  const ordered = kept.order.map(id => byId.get(id)!);
  const column = kept.arrangement === 'column';
  const bands = ordered.filter(n => (n.children?.length ?? 0) > 0);
  const span = Math.max(0, ...bands.map(n => (column ? n.width! : n.height!)));
  for (const n of bands) {
    const own = column ? n.width! : n.height!;
    if (own >= span) continue;
    spreadInterior(ctx, n, span, column);
    if (column) n.width = span; else n.height = span;
  }
  for (const p of packGrid(ordered, column ? 1 : ordered.length)) {
    const n = byId.get(p.id)!;
    n.x = p.x;
    n.y = p.y;
  }
  return levelBounds(items, { ...ROOT_PAD, left: 0, top: 0 }, true);
}

/**
 * Spread a stretched band's interior children over the new extent along the
 * stretch axis. Children that do not fill the old extent (a narrow column
 * inside a wide band) are left alone — spreading them would distort the layout.
 */
function spreadInterior(ctx: Ctx, band: ElkNode, size: number, alongX: boolean): void {
  const pad = containerInsets(ctx.cells.get(band.id)?.style ?? '');
  const old = alongX ? band.width! : band.height!;
  const inset = alongX ? pad.left + pad.right : pad.top + pad.bottom;
  const anchor = alongX ? pad.left : pad.top;
  const innerOld = old - inset, innerNew = size - inset;
  if (innerOld <= 0 || innerNew <= innerOld) return;
  const used = Math.max(0, ...band.children!.map(c => (alongX ? c.x! + c.width : c.y! + c.height))) - anchor;
  if (used < innerOld * 0.6) return;
  const f = innerNew / innerOld;
  for (const c of band.children!) {
    if (alongX) c.x = anchor + (c.x! - anchor) * f;
    else c.y = anchor + (c.y! - anchor) * f;
  }
}
