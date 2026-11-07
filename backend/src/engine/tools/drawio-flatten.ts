/**
 * SA4E-410 (DISC-3) — draw.io CLI cannot render nested `<mxCell>` elements.
 *
 * Hand-authored draw.io files often declare a container's children as XML
 * children of the container cell:
 *
 *   <mxCell id="group" parent="host">
 *     <mxCell id="child" parent="group"><mxGeometry x="10" y="10" .../></mxCell>
 *     <mxGeometry x="0" y="0" .../>
 *   </mxCell>
 *
 * draw.io Desktop renders that fine, but `draw.io --export` aborts with
 * "Export failed" and writes NO png. The CLI only consumes the *flat* form
 * where every cell is a root-level sibling.
 *
 * This module rewrites a diagram into that flat form by HOISTING every
 * physically nested `<mxCell>` to root level.
 *
 * IMPORTANT — "nested" means PHYSICAL XML nesting (a `<mxCell>` element inside
 * another `<mxCell>` element), NOT draw.io's logical `parent="..."` chain:
 * a flat file legitimately uses `parent="container"` to place a cell inside a
 * swimlane, and such a file must NOT be rewritten.
 *
 * The hoisted cell KEEPS its original `parent="..."` attribute and its
 * original (relative) geometry. draw.io resolves the coordinate space through
 * the logical parent, so the rendering stays pixel-identical and NO coordinate
 * arithmetic is required. Converting to absolute coordinates is actively
 * harmful: adding ancestor offsets twice inflates the canvas until the
 * renderer aborts with a GPU crash.
 *
 * The result renders identically in draw.io Desktop AND exports via the CLI.
 */

import { parseCells } from './drawio-flatten-parser.js';
import { renderRootCell, renderFlatCell } from './drawio-flatten-renderer.js';
import type { Cell } from './drawio-flatten-types.js';

/**
 * Rewrite a draw.io document into the flat form that the draw.io CLI can
 * render. Returns the input unchanged when it already is flat.
 */
export function flattenNestedCells(xml: string): string {
  const rootOpen = xml.indexOf('<root>');
  const rootClose = xml.lastIndexOf('</root>');
  if (rootOpen === -1 || rootClose === -1) return xml;

  const body = xml.slice(rootOpen + '<root>'.length, rootClose);
  const cells: Cell[] = [];
  parseCells(body, 0, { n: 0 }, cells);

  if (!cells.some(c => c.xmlDepth > 1)) return xml; // already flat → nothing to do

  const head = xml.slice(0, rootOpen + '<root>'.length);
  const tail = xml.slice(rootClose);

  const ordered = cells.slice().sort((a, b) => a.order - b.order);
  const rootCells = ordered.filter(c => c.id === '0' || c.id === '1');
  const contentCells = ordered.filter(c => c.id !== '0' && c.id !== '1');

  // The nested cells are hoisted to root level but KEEP their original
  // `parent="..."` attribute and their relative geometry — draw.io resolves
  // the coordinate space through the logical parent, so the rendering is
  // pixel-identical. No coordinate arithmetic is done (and none may be done:
  // adding ancestor offsets twice inflates the canvas and crashes the GPU).
  const rendered = [
    ...rootCells.map(c => renderRootCell(c)),
    ...contentCells.map(c => renderFlatCell(c)),
  ];
  return `${head}\n    ${rendered.join('\n    ')}\n  ${tail}`;
}