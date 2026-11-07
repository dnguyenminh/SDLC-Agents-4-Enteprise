/**
 * SA4E-410 (DISC-3) — Parsing functions for draw.io flattening.
 */

import { parseAttrs } from './drawio-flatten-utils.js';
import type { Cell, Range } from './drawio-flatten-types.js';

/** Locate the matching `</mxCell>` for a cell whose open tag ends before `from`. */
export function findMatchingClose(xml: string, from: number): { contentEnd: number; next: number } {
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

/** Find the ranges occupied by the *direct* `<mxCell>` children of `body`. */
export function findNestedCellRanges(body: string): Range[] {
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
export function removeRanges(text: string, ranges: Range[]): string {
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

/** Parse every mxCell inside `xml`, recording physical XML depth and the cell's own inner XML. */
export function parseCells(xml: string, depth: number, order: { n: number }, out: Cell[]): void {
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

    for (const r of nestedRanges) {
      parseCells(body.slice(r.start, r.end), depth + 1, order, out);
    }

    cursor = close.next;
    tagRe.lastIndex = close.next;
  }
}

/** Extract geometry attributes from inner XML. */
function parseGeometryAttrs(inner: string): Record<string, string> | null {
  const m = /<mxGeometry\s(?:"[^"]*"|'[^']*'|[^"'>])*?(?:\/>|>)/.exec(inner);
  if (!m) return null;
  const attrs = parseAttrs(m[0]);
  if (attrs['as'] && attrs['as'] !== 'geometry') return null;
  return attrs;
}