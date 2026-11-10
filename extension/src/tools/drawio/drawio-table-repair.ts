/**
 * SA4E-406 — rebuild draw.io table geometry and release shapes trapped in a table.
 *
 * A table is a root (`shape=table`) holding rows (`shape=tableRow`) that hold
 * cells (`shape=tableCell` / `partialRectangle`). Their geometry is strictly
 * relative: rows stack vertically at x=0, cells sit side by side at y=0, every
 * row has the same columns, the table is as big as its content. A generic
 * layout pass that treats rows and cells as free nodes scatters them.
 *
 * Repairs, all idempotent (a healthy table comes back byte-identical):
 *   1. Lift out foreign shapes. LLMs hang a whole flow on a table ROW as if it
 *      were a canvas; those shapes move to the table's parent (absolute coords)
 *      and a row left with no cells is removed.
 *   2. Split a table whose rows have different column counts (drawio-table-split).
 *   3. Restore row/cell/table geometry with uniform column widths.
 */

import { cellsOf, Geo, isPart, readCells, ROW, rowsOf, TABLE, TCell } from './drawio-table-cells';
import { splitMixedTable } from './drawio-table-split';
import { clearEdgeTerminalPoints, patchCell, setCellParent, setEdgePointsXml } from './drawio-xml-utils';

const DEFAULT_CELL_W = 100;
const DEFAULT_ROW_H = 40;
const DEFAULT_SHAPE_W = 80;
const DEFAULT_SHAPE_H = 40;
/** draw.io's title bar of a table whose style does not say otherwise. */
const DEFAULT_TITLE_H = 30;
/** Vertical gap between the parts of a split table. */
const PART_GAP = 20;
const TOL = 0.5;

const round = (v: number): number => Math.round(v * 10) / 10;

/** Width of every column: the widest cell of that column over all rows (draw.io needs uniform columns). */
function columnWidths(rows: TCell[], all: TCell[]): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    cellsOf(row.id, all).forEach((c, i) => { widths[i] = Math.max(widths[i] ?? 0, c.geo.width ?? DEFAULT_CELL_W); });
  }
  return widths;
}

/** Target geometry for every part of one table (parts only; foreign shapes are not included). */
function normalize(table: TCell, all: TCell[]): Map<string, Geo> {
  const target = new Map<string, Geo>();
  const rows = rowsOf(table.id, all);
  const colW = columnWidths(rows, all);
  const titleH = /(?:^|;)startSize=([\d.]+)/.exec(table.style)?.[1];
  let y = titleH !== undefined ? Number(titleH) : table.value.trim() === '' ? 0 : DEFAULT_TITLE_H;
  let tableW = 0;
  for (const row of rows) {
    const cells = cellsOf(row.id, all);
    const rowH = Math.max(row.geo.height ?? 0, ...cells.map(c => c.geo.height ?? 0), cells.length ? 0 : DEFAULT_ROW_H) || DEFAULT_ROW_H;
    let x = 0;
    cells.forEach((c, i) => { target.set(c.id, { x, y: 0, width: colW[i], height: rowH }); x += colW[i]; });
    target.set(row.id, { x: 0, y, width: x, height: rowH });
    tableW = Math.max(tableW, x);
    y += rowH;
  }
  target.set(table.id, { x: table.geo.x ?? 0, y: table.geo.y ?? 0, width: tableW, height: y });
  return target;
}

/** True when the stored geometry differs from the target (missing attributes count as unset). */
function differs(cell: TCell, want: Geo): boolean {
  const have = cell.geo;
  const eq = (a: number | undefined, b: number): boolean => a !== undefined && Math.abs(a - b) <= TOL;
  return !(eq(have.x ?? 0, want.x) && eq(have.y ?? 0, want.y) && eq(have.width, want.width) && eq(have.height, want.height));
}

/** Rewrite x/y/width/height of one cell's <mxGeometry>, keeping its other attributes. */
function setGeometry(xml: string, id: string, g: Geo): string {
  return patchCell(xml, id, (open, body) => {
    const re = /<mxGeometry\b([^>]*?)(\/?)>/;
    const m = re.exec(body);
    if (!m) return null;
    const rest = m[1].replace(/\s(?:x|y|width|height)="[^"]*"/g, '');
    const attrs = ` x="${round(g.x)}" y="${round(g.y)}" width="${round(g.width)}" height="${round(g.height)}"${rest}`;
    return { open, body: body.replace(re, `<mxGeometry${attrs}${m[2]}>`) };
  });
}

/** Origin of `parentId` (a row or cell of `table`) in the coordinate space of the table's own parent. */
function originInTable(parentId: string, table: TCell, byId: Map<string, TCell>, target: Map<string, Geo>): { x: number; y: number } {
  const own = { x: table.geo.x ?? 0, y: table.geo.y ?? 0 };
  const chain: string[] = [];
  for (let cur = parentId; cur && cur !== table.id && chain.length < 20; cur = byId.get(cur)?.parent ?? '') chain.push(cur);
  return chain.reduce((o, id) => ({ x: o.x + (target.get(id)?.x ?? 0), y: o.y + (target.get(id)?.y ?? 0) }), own);
}

/** Shapes (and their edges) hung on the table's rows/cells that are not table content. */
function foreignChildren(table: TCell, all: TCell[]): TCell[] {
  const inside = new Set<string>([table.id]);
  all.filter(c => isPart(c.style)).forEach(c => inside.add(c.id));
  return all.filter(c => inside.has(c.parent) && c.id !== table.id && !isPart(c.style));
}

/** Move one foreign cell to the table's parent with absolute coordinates. */
function liftCell(xml: string, c: TCell, table: TCell, origin: { x: number; y: number }): string {
  const out = setCellParent(xml, c.id, table.parent || '1');
  // Waypoints belong to the old coordinate space; the layout re-plans routed edges anyway
  if (c.edge) return clearEdgeTerminalPoints(setEdgePointsXml(out, c.id, []), c.id);
  return setGeometry(out, c.id, {
    x: (c.geo.x ?? 0) + origin.x, y: (c.geo.y ?? 0) + origin.y,
    width: c.geo.width ?? DEFAULT_SHAPE_W, height: c.geo.height ?? DEFAULT_SHAPE_H,
  });
}

/** Remove the `<mxCell id=… …>…</mxCell>` element of a row left without cells. */
function removeCell(xml: string, id: string): string {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return xml.replace(new RegExp(`\\s*<mxCell\\b(?:[^"<>]|"[^"]*")*?\\bid="${esc}"(?:[^"<>]|"[^"]*")*?(?:/>|>[\\s\\S]*?</mxCell>)`), '');
}

/** Step 1: lift foreign shapes, then drop rows that only hosted them. */
function liftForeign(xml: string, table: TCell): { xml: string; changed: boolean } {
  const all = readCells(xml);
  const lifted = foreignChildren(table, all);
  if (lifted.length === 0) return { xml, changed: false };
  const byId = new Map(all.map(c => [c.id, c]));
  const target = normalize(table, all);
  let out = lifted.reduce((x, c) => liftCell(x, c, table, originInTable(c.parent, table, byId, target)), xml);
  const after = readCells(out);
  for (const id of new Set(lifted.map(c => c.parent))) {
    const row = byId.get(id);
    if (row && ROW.test(row.style) && !after.some(c => c.parent === id)) out = removeCell(out, id);
  }
  return { xml: out, changed: true };
}

/** Append `startSize=value` to a cell's style when the style has none. */
function ensureStartSize(xml: string, cell: TCell, value: number): string {
  if (/(?:^|;)startSize=/.test(cell.style)) return xml;
  const style = `${cell.style.replace(/;?$/, ';')}startSize=${value};`;
  return patchCell(xml, cell.id, (open, body) => ({ open: open.replace(/\sstyle="[^"]*"/, ` style="${style}"`), body }));
}

/**
 * draw.io computes a table's grid lines from the `startSize` of the table and of
 * each row (default 40 when absent), not from row geometry. Without an explicit
 * value every column line overshoots the table bottom by 40 px.
 */
function pinStartSizes(xml: string, tableId: string): string {
  const all = readCells(xml);
  const table = all.find(c => c.id === tableId)!;
  let out = ensureStartSize(xml, table, table.value.trim() === '' ? 0 : DEFAULT_TITLE_H);
  for (const row of rowsOf(tableId, all)) out = ensureStartSize(out, row, 0);
  return out;
}

/** Step 3: write the target geometry of each part; parts after the first stack below it. */
function layoutParts(xml: string, partIds: string[]): { xml: string; changed: boolean } {
  let out = xml;
  let changed = false;
  let nextY: number | undefined;
  for (const id of partIds) {
    const pinned = pinStartSizes(out, id);
    changed ||= pinned !== out;
    out = pinned;
    const all = readCells(out);
    const target = normalize(all.find(c => c.id === id)!, all);
    const own = target.get(id)!;
    if (nextY !== undefined) own.y = nextY;
    nextY = own.y + own.height + PART_GAP;
    const byId = new Map(all.map(c => [c.id, c]));
    if (![...target].some(([cid, want]) => differs(byId.get(cid)!, want))) continue;
    for (const [cid, want] of target) out = setGeometry(out, cid, want);
    changed = true;
  }
  return { xml: out, changed };
}

function repairOne(xml: string, tableId: string): { xml: string; changed: boolean } {
  const find = (x: string): TCell => readCells(x).find(c => c.id === tableId)!;
  const lifted = liftForeign(xml, find(xml));
  const all = readCells(lifted.xml);
  const split = splitMixedTable(lifted.xml, find(lifted.xml), all);
  const laid = layoutParts(split.xml, split.parts.map(p => p.id));
  return { xml: laid.xml, changed: lifted.changed || split.parts.length > 1 || laid.changed };
}

/** Restore row/cell/table geometry wherever it is inconsistent and release foreign shapes. */
export function repairTables(xml: string): { xml: string; repaired: number } {
  let out = xml;
  let repaired = 0;
  for (const table of readCells(xml).filter(c => TABLE.test(c.style))) {
    const r = repairOne(out, table.id);
    out = r.xml;
    if (r.changed) repaired++;
  }
  return { xml: out, repaired };
}
