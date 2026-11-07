/**
 * SA4E-410 (DISC-3) — Rendering functions for draw.io flattening.
 */

import { escapeAttr, serializeAttrs } from './drawio-flatten-utils.js';
import type { Cell } from './drawio-flatten-types.js';

/** The root layer cells (`id="0"` and `id="1"`) anchor the default layer. */
export function renderRootCell(cell: Cell): string {
  const attrs = serializeAttrs(cell.attrs);
  return cell.ownInner
    ? `<mxCell ${attrs}>${cell.ownInner}</mxCell>`
    : `<mxCell ${attrs}/>`;
}

/** Render a non-root cell at root level, keeping its logical parent intact. */
export function renderFlatCell(cell: Cell): string {
  const attrs = serializeAttrs(cell.attrs);
  const leading = cell.leading.trim() ? cell.leading : '';

  if (cell.isEdge) {
    return `${leading}<mxCell ${attrs}>${cell.ownInner}</mxCell>`;
  }

  const geom = cell.hasGeometry ? extractGeometry(cell.ownInner) : '';
  const extra = cell.ownInner.replace(/<mxGeometry\s(?:"[^"]*"|'[^']*'|[^"'>])*?(?:\/>|>)/g, '');
  return `${leading}<mxCell ${attrs}>${geom}${extra}</mxCell>`;
}

/** Extract the first `<mxGeometry .../>` element of a cell body (quote-aware). */
export function extractGeometry(inner: string): string {
  const m = /<mxGeometry\s(?:"[^"]*"|'[^']*'|[^"'>])*?(?:\/>|>)/.exec(inner);
  return m ? m[0] : '';
}