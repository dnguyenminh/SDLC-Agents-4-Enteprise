/**
 * SA4E-406 — shared reader for draw.io table repair: flat list of mxCells with
 * their geometry, plus the style predicates that identify table parts.
 */

/** Geometry of one cell (absolute within its parent). */
export interface Geo { x: number; y: number; width: number; height: number; }

/** Minimal view of an `<mxCell>` used by the table repair passes. */
export interface TCell {
  id: string; parent: string; style: string; value: string; edge: boolean; geo: Partial<Geo>;
  /** Edge terminals (empty for vertices / loose edges). */
  source: string; target: string;
}

export const TABLE = /(?:^|;)shape=table(?:;|$)/;
export const ROW = /(?:^|;)shape=tableRow(?:;|$)/;
export const CELL = /(?:^|;)shape=(?:tableCell|partialRectangle)(?:;|$)/;
/** Rows and cells are table content; the table root is not. */
export const isPart = (s: string): boolean => ROW.test(s) || CELL.test(s);

const num = (s: string | undefined): number | undefined => (s === undefined ? undefined : Number(s));

/**
 * Read every `<mxCell>` in document order.
 * @param xml - draw.io XML
 * @returns cells with id/parent/style/value and the x/y/width/height that are present
 */
export function readCells(xml: string): TCell[] {
  const out: TCell[] = [];
  for (const m of xml.matchAll(/<mxCell\s((?:[^"<>]|"[^"]*")*?)\s*(?:\/>|>([\s\S]*?)<\/mxCell>)/g)) {
    const a = (k: string): string => new RegExp(`(?:^|\\s)${k}="([^"]*)"`).exec(m[1])?.[1] ?? '';
    const g = /<mxGeometry\s([^>]*?)\/?>/.exec(m[2] ?? '')?.[1] ?? '';
    const ga = (k: string): number | undefined => num(new RegExp(`(?:^|\\s)${k}="([^"]*)"`).exec(g)?.[1]);
    out.push({
      id: a('id'), parent: a('parent'), style: a('style'), value: a('value'), edge: a('edge') === '1',
      source: a('source'), target: a('target'),
      geo: { x: ga('x'), y: ga('y'), width: ga('width'), height: ga('height') },
    });
  }
  return out;
}

/** Rows of `tableId` in document order. */
export const rowsOf = (tableId: string, all: TCell[]): TCell[] =>
  all.filter(c => c.parent === tableId && ROW.test(c.style));

/** Cells of `rowId` in document order. */
export const cellsOf = (rowId: string, all: TCell[]): TCell[] =>
  all.filter(c => c.parent === rowId && CELL.test(c.style));
