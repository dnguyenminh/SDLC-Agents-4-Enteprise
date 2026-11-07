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

interface Cell {
  id: string;
  isEdge: boolean;
  /** Raw opening-tag attributes (without the tag name). */
  attrs: string;
  /** Inner XML of the cell WITHOUT its physically nested cells. */
  ownInner: string;
  /** Text (usually XML comments) that preceded this cell in the source. */
  leading: string;
  hasGeometry: boolean;
  /** Index in document order. */
  order: number;
  /** Physical XML nesting depth: 1 = direct child of `<root>`. */
  xmlDepth: number;
}

const AMP = String.fromCharCode(38) + 'amp;';
const LT = String.fromCharCode(38) + 'lt;';
const GT = String.fromCharCode(38) + 'gt;';
const QUOT = String.fromCharCode(38) + 'quot;';

function parseAttrs(attrStr: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) out[m[1]] = m[2];
  return out;
}

function parseGeometryAttrs(inner: string): Record<string, string> | null {
  const m = /<mxGeometry\s(?:"[^"]*"|'[^']*'|[^"'>])*?(?:\/>|>)/.exec(inner);
  if (!m) return null;
  const attrs = parseAttrs(m[0]);
  if (attrs['as'] && attrs['as'] !== 'geometry') return null;
  return attrs;
}

/** Locate the matching `</mxCell>` for a cell whose open tag ends before `from`. */
function findMatchingClose(xml: string, from: number): { contentEnd: number; next: number } {
  // Quote-aware attribute segment (DISC-3b): `[^>]*?` stops at the first `>`
  // — including one inside a quoted value like value="Map<string, X>" —
  // producing a partial tag match and mis-paired close tags.
  const re = /<mxCell\b(?:"[^"]*"|'[^']*'|[^"'>])*?(?:\/>|>)|<\/mxCell>/g;
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[0] === '</mxCell>') {
      depth--;
      if (depth === 0) return { contentEnd: m.index, next: m.index + m[0].length };
    } else if (!m[0].endsWith('/>')) {
      depth++;
    }
  }
  return { contentEnd: xml.length, next: xml.length };
}

/** A byte range inside a string. */
interface Range {
  start: number;
  end: number;
}

/**
 * Find the ranges occupied by the *direct* `<mxCell>` children of `body`.
 * Depth-aware: a nested cell (and its own descendants) counts as one range.
 */
function findNestedCellRanges(body: string): Range[] {
  const ranges: Range[] = [];
  const tagRe = /<mxCell\b(?:"[^"]*"|'[^']*'|[^"'>])*?(?:\/>|>)/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(body)) !== null) {
    if (m[0].endsWith('/>')) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
      continue;
    }
    const close = findMatchingClose(body, m.index + m[0].length);
    ranges.push({ start: m.index, end: close.next });
    tagRe.lastIndex = close.next;
  }
  return ranges;
}

/** Remove the given ranges from `text`. */
function removeRanges(text: string, ranges: Range[]): string {
  if (ranges.length === 0) return text;
  let out = '';
  let cursor = 0;
  for (const r of ranges) {
    out += text.slice(cursor, r.start);
    cursor = r.end;
  }
  out += text.slice(cursor);
  return out;
}

/**
 * Parse every mxCell inside `xml`, recording physical XML depth and the
 * cell's own inner XML (without its physically nested cells).
 */
function parseCells(xml: string, depth: number, order: { n: number }, out: Cell[]): void {
  // Quote-aware attr segment — see DISC-3b note on findMatchingClose.
  const tagRe = /<mxCell\b((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)>/g;
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(xml)) !== null) {
    const leading = xml.slice(cursor, m.index);
    const attrStr = m[1];
    const selfClosing = m[2] === '/';
    const attrs = parseAttrs(attrStr);
    const id = attrs['id'] ?? '';
    const isEdge = attrs['edge'] === '1';

    if (selfClosing) {
      out.push({
        id,
        isEdge,
        attrs: attrStr,
        ownInner: '',
        leading,
        hasGeometry: false,
        order: order.n++,
        xmlDepth: depth + 1,
      });
      cursor = m.index + m[0].length;
      tagRe.lastIndex = cursor;
      continue;
    }

    const close = findMatchingClose(xml, m.index + m[0].length);
    const body = xml.slice(m.index + m[0].length, close.contentEnd);
    const nestedRanges = findNestedCellRanges(body);
    const ownInner = removeRanges(body, nestedRanges);

    out.push({
      id,
      isEdge,
      attrs: attrStr,
      ownInner,
      leading,
      hasGeometry: parseGeometryAttrs(ownInner) !== null,
      order: order.n++,
      xmlDepth: depth + 1,
    });

    // Recurse into every physically nested cell (one level deeper).
    // `r` indexes into `body`, so slice `body` — not `xml`.
    for (const r of nestedRanges) {
      parseCells(body.slice(r.start, r.end), depth + 1, order, out);
    }

    cursor = close.next;
    tagRe.lastIndex = close.next;
  }
}

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

/**
 * The root layer cells (`id="0"` and `id="1"`) anchor the default layer.
 * They must NOT receive a geometry nor be re-parented, otherwise every
 * `parent="1"` cell becomes orphaned and draw.io renders an empty page.
 */
function renderRootCell(cell: Cell): string {
  const attrs = serializeAttrs(parseAttrs(cell.attrs));
  return cell.ownInner
    ? `<mxCell ${attrs}>${cell.ownInner}</mxCell>`
    : `<mxCell ${attrs}/>`;
}

/** Render a non-root cell at root level, keeping its logical parent intact. */
function renderFlatCell(cell: Cell): string {
  const attrs = serializeAttrs(parseAttrs(cell.attrs));
  const leading = cell.leading.trim() ? cell.leading : '';

  if (cell.isEdge) {
    // Edges keep their waypoints verbatim — they are already expressed in
    // the coordinate space of their logical parent.
    return `${leading}<mxCell ${attrs}>${cell.ownInner}</mxCell>`;
  }

  // Vertex: keep the original geometry (relative to the logical parent).
  const geom = cell.hasGeometry ? extractGeometry(cell.ownInner) : '';
  const extra = cell.ownInner.replace(/<mxGeometry\s(?:"[^"]*"|'[^']*'|[^"'>])*?(?:\/>|>)/g, '');
  return `${leading}<mxCell ${attrs}>${geom}${extra}</mxCell>`;
}

/** Extract the first `<mxGeometry .../>` element of a cell body (quote-aware). */
function extractGeometry(inner: string): string {
  const m = /<mxGeometry\s(?:"[^"]*"|'[^']*'|[^"'>])*?(?:\/>|>)/.exec(inner);
  return m ? m[0] : '';
}

function serializeAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
    .join(' ');
}

/** Escape a value for use inside a double-quoted XML attribute. */
export function escapeAttr(v: string): string {
  return v
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, AMP)
    .replace(/</g, LT)
    .replace(/>/g, GT)
    .replace(/"/g, QUOT);
}
