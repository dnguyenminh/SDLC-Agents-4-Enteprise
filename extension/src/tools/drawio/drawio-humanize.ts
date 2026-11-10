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
  const linked = new Set(pairs.flat());
  const orphans = pairs.length > 0 ? items.filter(i => !linked.has(i.id)) : [];
  const flow = items.filter(i => !orphans.includes(i));
  let pos = await elkPositions(ctx, flow, pairs, dir);
  // A long chain laid out as one strip (20 steps → 1:20) is unreadable: wrap it
  if (flow.length >= WRAP_MIN_NODES && isStrip(flow, pos)) pos = await elkPositions(ctx, flow, pairs, dir, true);
  shelveOrphans(orphans, flow, pos);
  const pad = isRoot ? ROOT_PAD : containerInsets(ctx.cells.get(key)?.style ?? '');
  for (const n of items) {
    const p = pos.get(n.id) ?? { x: 0, y: 0 };
    n.x = p.x + pad.left;
    n.y = p.y + pad.top;
  }
  return levelBounds(items, pad, isRoot);
}

/** Root packing of bands (and loose nodes) in flow order on an aligned grid. */
function packRoot(ctx: Ctx, items: ElkNode[], pairs: Pair[]): Level {
  const byId = new Map(items.map(i => [i.id, i]));
  const ordered = orderByFlow(items.map(i => i.id), pairs).map(id => byId.get(id)!);
  const explicit = ctx.args.directionExplicit ? ctx.args.direction : undefined;
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
