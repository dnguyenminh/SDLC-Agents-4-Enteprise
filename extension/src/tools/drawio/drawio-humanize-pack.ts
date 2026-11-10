/**
 * SA4E-406 — root-level arrangement helpers for the humanize layout:
 * flow ordering of bands, column-count selection, and aligned grid packing.
 * Pure arithmetic over item sizes; no ELK, no XML.
 */

export interface PackItem { id: string; width: number; height: number; }
export interface Placement { id: string; x: number; y: number; }

export const GRID_MARGIN = 40;
export const GRID_GUTTER = 80;
/** Preferred overall width:height of the packed diagram (landscape, screen-like). */
const TARGET_ASPECT = 1.6;
/** A single column is kept while its aspect stays inside this window. */
const COLUMN_OK_MIN = 0.5;
const COLUMN_OK_MAX = 2.2;

/**
 * Order ids so that edge sources come before targets (Kahn). Ties keep the
 * original order; when a cycle blocks progress the earliest remaining id goes next.
 */
export function orderByFlow(ids: string[], pairs: Array<[string, string]>): string[] {
  const indeg = new Map(ids.map(i => [i, 0]));
  const out = new Map(ids.map(i => [i, [] as string[]]));
  for (const [a, b] of pairs) {
    if (a === b || !indeg.has(a) || !indeg.has(b)) continue;
    out.get(a)!.push(b);
    indeg.set(b, indeg.get(b)! + 1);
  }
  const done = new Set<string>();
  const order: string[] = [];
  while (order.length < ids.length) {
    const next = ids.find(i => !done.has(i) && indeg.get(i)! <= 0) ?? ids.find(i => !done.has(i))!;
    done.add(next);
    order.push(next);
    for (const m of out.get(next)!) indeg.set(m, indeg.get(m)! - 1);
  }
  return order;
}

/** Number of grid columns: user direction wins, else keep flow vertical, else best aspect. */
export function chooseColumns(items: PackItem[], hasFlow: boolean, explicitDirection?: string): number {
  const n = items.length;
  if (n <= 1) return 1;
  if (explicitDirection === 'RIGHT' || explicitDirection === 'LEFT') return n;
  if (explicitDirection === 'DOWN' || explicitDirection === 'UP') return 1;
  const single = aspectFor(items, 1);
  if (hasFlow && single >= COLUMN_OK_MIN && single <= COLUMN_OK_MAX) return 1;
  let best = 1, bestScore = Infinity;
  for (let c = 1; c <= n; c++) {
    const score = Math.abs(Math.log(aspectFor(items, c) / TARGET_ASPECT));
    if (score < bestScore - 1e-9) { best = c; bestScore = score; }
  }
  return best;
}

/** Row-major placement: column left edges and row tops aligned, constant gutters. */
export function packGrid(items: PackItem[], cols: number): Placement[] {
  const { colW, rowH } = gridSizes(items, cols);
  const colX = prefixSums(colW, GRID_MARGIN), rowY = prefixSums(rowH, GRID_MARGIN);
  return items.map((it, i) => ({ id: it.id, x: colX[i % cols], y: rowY[Math.floor(i / cols)] }));
}

/** Overall width/height ratio when packed into `cols` columns. */
function aspectFor(items: PackItem[], cols: number): number {
  const { colW, rowH } = gridSizes(items, cols);
  const w = colW.reduce((a, b) => a + b, 0) + GRID_GUTTER * (colW.length - 1);
  const h = rowH.reduce((a, b) => a + b, 0) + GRID_GUTTER * (rowH.length - 1);
  return w / h;
}

function gridSizes(items: PackItem[], cols: number): { colW: number[]; rowH: number[] } {
  const rows = Math.ceil(items.length / cols);
  const colW = new Array<number>(Math.min(cols, items.length)).fill(0);
  const rowH = new Array<number>(rows).fill(0);
  items.forEach((it, i) => {
    colW[i % cols] = Math.max(colW[i % cols], it.width);
    rowH[Math.floor(i / cols)] = Math.max(rowH[Math.floor(i / cols)], it.height);
  });
  return { colW, rowH };
}

/**
 * Row width for shelf packing: the width a landscape layout of the same total
 * area would have, but never narrower than the widest item. Many similar-sized
 * boxes (class diagrams) then form a grid; a few big bands still get a row each.
 */
export function shelfWidth(items: PackItem[]): number {
  const area = items.reduce((sum, i) => sum + (i.width + GRID_GUTTER) * (i.height + GRID_GUTTER), 0);
  return Math.max(...items.map(i => i.width), Math.sqrt(area * TARGET_ASPECT));
}

/**
 * Shelf packing in flow order: items fill a row left to right and wrap when the
 * next one would exceed `maxWidth`; rows are top-aligned. Narrow bands that
 * come one after another therefore sit side by side under a wide band instead
 * of each taking a whole row.
 */
export function packShelves(items: PackItem[], maxWidth: number): Placement[] {
  const out: Placement[] = [];
  let x = GRID_MARGIN, y = GRID_MARGIN, rowH = 0;
  for (const it of items) {
    if (x > GRID_MARGIN && x + it.width > GRID_MARGIN + maxWidth) {
      x = GRID_MARGIN;
      y += rowH + GRID_GUTTER;
      rowH = 0;
    }
    out.push({ id: it.id, x, y });
    x += it.width + GRID_GUTTER;
    rowH = Math.max(rowH, it.height);
  }
  return out;
}

/** Start offsets of consecutive tracks separated by the gutter. */
function prefixSums(sizes: number[], start: number): number[] {
  const out: number[] = [];
  let acc = start;
  for (const s of sizes) { out.push(acc); acc += s + GRID_GUTTER; }
  return out;
}
