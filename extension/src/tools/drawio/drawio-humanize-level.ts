/**
 * SA4E-406 — level helpers of the humanize layout: the shared context, flat ELK
 * positions, orphan shelving, row-list stacking and level bounds.
 */

import type { DiagramGraph, DiagramNode } from './drawio-parser';
import type { ElkNode, NormalizedArgs } from './drawio-layout-models';
import { flatPositions, type Pair } from './drawio-humanize-elk';
import { containerInsets, type Insets } from './drawio-container-insets';
import { isTextRow } from './drawio-style';
import { isExtremeAspect } from './drawio-detect-aspect';
import { GRID_MARGIN } from './drawio-humanize-pack';

export const ROOT_PAD = { top: GRID_MARGIN, left: GRID_MARGIN, right: GRID_MARGIN, bottom: GRID_MARGIN };
export const MIN_BAND = { w: 120, h: 80 };
export const ROOT = '1';

/** Shared state of one humanize run. */
export interface Ctx {
  graph: DiagramGraph;
  args: NormalizedArgs;
  timeoutMs: number;
  cells: Map<string, DiagramNode>;
  kids: Map<string, DiagramNode[]>;
}
/** A laid-out level: its size and positioned children. */
export interface Level { width: number; height: number; nodes: ElkNode[]; }
export type Pad = Insets;
type Positions = Map<string, { x: number; y: number }>;

/**
 * A container whose children are all label rows with no edge among them is a
 * list (UML class attributes, a table): its rows read top to bottom, not as a flow.
 */
export function isRowList(ctx: Ctx, items: ElkNode[], pairs: Pair[]): boolean {
  return pairs.length === 0 && items.length >= 2
    && items.every(i => !(i.children?.length) && isTextRow(ctx.cells.get(i.id)?.style ?? ''));
}

/** Stack rows vertically, flush against each other, in declaration order. */
export function stackLevel(ctx: Ctx, items: ElkNode[], key: string): Level {
  const pad = containerInsets(ctx.cells.get(key)?.style ?? '');
  let y = pad.top;
  for (const n of items) {
    n.x = pad.left;
    n.y = y;
    y += n.height;
  }
  const widest = Math.max(...items.map(n => n.width));
  return {
    width: Math.max(pad.left + widest + pad.right, MIN_BAND.w),
    height: Math.max(y + pad.bottom, MIN_BAND.h),
    nodes: items,
  };
}

/** Gap between the flow and the orphan shelf, and between shelved nodes. */
const SHELF_GAP = 40;
/** Shelf rows wrap at the flow width, but never narrower than this. */
const SHELF_MIN_WIDTH = 480;

/**
 * Place edge-less nodes in wrapped rows below the laid-out flow (mutates `pos`).
 * The shelf coordinates CARRY the container insets (`insets`): the caller adds
 * no further pad, so the shelf can neither slide under the title strip nor run
 * past the right inset (SA4E-406). `minWrap` is the container's interior width.
 */
export function shelveOrphans(
  orphans: ElkNode[], flow: ElkNode[], pos: Positions, insets: Insets, minWrap = 0,
): void {
  if (orphans.length === 0) return;
  const bottom = Math.max(0, ...flow.map(n => (pos.get(n.id)?.y ?? 0) + n.height));
  const right = Math.max(0, ...flow.map(n => (pos.get(n.id)?.x ?? 0) + n.width));
  // minWrap = interior width the author gave the container: a shelf as wide as the drawn band
  const wrapAt = Math.max(right, SHELF_MIN_WIDTH, minWrap);
  const x0 = insets.left;
  let x = x0, y = (flow.length > 0 ? bottom + SHELF_GAP : 0) + insets.top, rowH = 0;
  for (const n of orphans) {
    if (x > x0 && x + n.width - x0 > wrapAt) { x = x0; y += rowH + SHELF_GAP; rowH = 0; }
    pos.set(n.id, { x, y });
    x += n.width + SHELF_GAP;
    rowH = Math.max(rowH, n.height);
  }
}

/** Positions from a flat layered run over `items` + lifted edges. */
export function elkPositions(
  ctx: Ctx, items: ElkNode[], pairs: Pair[], dir: string, wrap = false,
): Promise<Positions> {
  const spacing = ctx.args.spacing;
  return flatPositions(items, pairs, {
    dir, algorithm: ctx.args.algorithm, timeoutMs: ctx.timeoutMs, wrap,
    nodeSpacing: Math.max(50, spacing * 0.7), layerSpacing: spacing * 1.25,
  });
}

/** True when the laid-out items form a strip (extreme width:height). */
export function isStrip(items: ElkNode[], pos: Positions): boolean {
  const at = (n: ElkNode) => pos.get(n.id) ?? { x: 0, y: 0 };
  const w = Math.max(...items.map(n => at(n).x + n.width)) - Math.min(...items.map(n => at(n).x));
  const h = Math.max(...items.map(n => at(n).y + n.height)) - Math.min(...items.map(n => at(n).y));
  return isExtremeAspect(w, h);
}

/** Bounding size of a positioned level (containers keep a minimum size). */
export function levelBounds(items: ElkNode[], pad: Pad, isRoot: boolean): Level {
  let maxR = 0, maxB = 0;
  for (const n of items) {
    maxR = Math.max(maxR, (n.x ?? 0) + n.width);
    maxB = Math.max(maxB, (n.y ?? 0) + n.height);
  }
  const width = maxR + pad.right, height = maxB + pad.bottom;
  return isRoot
    ? { width, height, nodes: items }
    : { width: Math.max(width, MIN_BAND.w), height: Math.max(height, MIN_BAND.h), nodes: items };
}
