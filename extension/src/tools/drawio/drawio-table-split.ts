/**
 * SA4E-406 — split a draw.io table whose rows have different column counts.
 *
 * draw.io's table shape paints its grid from the row/column structure and
 * assumes every row has the same columns. LLMs stack unrelated tables into one
 * (`6 stage columns` rows followed by `3 summary columns` rows); draw.io then
 * draws stray grid lines below the table. Each run of consecutive rows with the
 * same column count becomes its own table, stacked under the previous one.
 */

import { cellsOf, rowsOf, TCell } from './drawio-table-cells';
import { setCellParent } from './drawio-xml-utils';

/** One table produced by a split: the original root or a newly inserted one. */
export interface TablePart { id: string; rowIds: string[]; }

/** Group consecutive rows by column count; a row without cells joins the run before it. */
function groupRows(table: TCell, all: TCell[]): string[][] {
  const groups: string[][] = [];
  let lastCount = -1;
  for (const row of rowsOf(table.id, all)) {
    const count = cellsOf(row.id, all).length;
    if (groups.length === 0 || (count > 0 && count !== lastCount)) groups.push([]);
    groups[groups.length - 1].push(row.id);
    if (count > 0) lastCount = count;
  }
  return groups;
}

/** An id not used by any cell, derived from `base`. */
function freshId(base: string, taken: Set<string>): string {
  let k = 1;
  while (taken.has(`${base}-part${k}`)) k++;
  const id = `${base}-part${k}`;
  taken.add(id);
  return id;
}

/** Insert a new, untitled table root right before the `<mxCell>` of `beforeId`. */
function insertTableBefore(xml: string, table: TCell, id: string, beforeId: string): string {
  const esc = beforeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const at = new RegExp(`<mxCell\\b(?:[^"<>]|"[^"]*")*?\\bid="${esc}"`).exec(xml);
  if (!at) return xml;
  const x = table.geo.x ?? 0;
  // untitled part: drop the original's title size so the repair pins startSize=0
  const style = table.style.replace(/(^|;)startSize=[^;]*;?/, '$1');
  const cell = `<mxCell id="${id}" value="" style="${style}" vertex="1" parent="${table.parent || '1'}">`
    + `<mxGeometry x="${x}" y="${table.geo.y ?? 0}" width="0" height="0" as="geometry"/></mxCell>\n`;
  return xml.slice(0, at.index) + cell + xml.slice(at.index);
}

/**
 * Split `table` into tables of uniform column count.
 * @param xml - draw.io XML containing `table`
 * @param table - the table root as read from `xml`
 * @param all - every cell of `xml` (for id uniqueness and row lookup)
 * @returns rewritten XML and the parts in stacking order (first part = original table)
 */
export function splitMixedTable(xml: string, table: TCell, all: TCell[]): { xml: string; parts: TablePart[] } {
  const groups = groupRows(table, all);
  const parts: TablePart[] = [{ id: table.id, rowIds: groups[0] ?? [] }];
  if (groups.length <= 1) return { xml, parts };
  const taken = new Set(all.map(c => c.id));
  let out = xml;
  for (const rowIds of groups.slice(1)) {
    const id = freshId(table.id, taken);
    out = insertTableBefore(out, table, id, rowIds[0]);
    for (const rowId of rowIds) out = setCellParent(out, rowId, id);
    parts.push({ id, rowIds });
  }
  return { xml: out, parts };
}
