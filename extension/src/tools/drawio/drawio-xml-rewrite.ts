/**
 * SA4E-406 (F1): single-pass batch XML cell rewriter.
 *
 * Walks `<mxCell` open tags ONCE — literal anchor search + indexOf, forward
 * advancing offset, no backtracking regex, no `[\s\S]*?` — collecting each
 * cell's id, open tag and body, then applies per-id patch functions by Map
 * lookup and rebuilds the string by splicing original slices. Untouched
 * regions are copied verbatim. Cost is O(fileBytes + cells), not
 * O(cells × fileBytes).
 *
 * Patch semantics equal today's per-cell `patchCell` behaviour:
 *   - the patch function receives the cell's original open tag (without '>')
 *     and body; it returns a CellPatch with replacement open/body, or null
 *     to leave the cell untouched
 *   - self-closing cells (`<mxCell ... />`) have no body; patch is skipped
 *   - unknown ids are tolerated (no throw, no change)
 *   - duplicate ids in the Map: last write wins (a Map holds one entry/id)
 *   - empty patch map → input returned unchanged
 */

export interface CellPatch {
  open: string; // replacement "<mxCell attr=..." without the closing ">"
  body: string; // replacement inner XML between "<mxCell ...>" and "</mxCell>"
}

interface CellSpan {
  id: string;
  openStart: number; // index of "<mxCell"
  tagEnd: number;    // index of the closing ">" of the open tag
  close: number;     // index of "</mxCell>", or -1 when absent/unterminated
  selfClosing: boolean;
}

const CLOSE = '</mxCell>';
const CLOSE_LEN = CLOSE.length;

/**
 * Apply one patch per cell id in a single pass over the XML.
 * @param xml     draw.io XML (plain <mxCell ...> cells)
 * @param patches id → patch function; receives (open, body) and returns a
 *                CellPatch or null to leave the cell untouched. Unknown ids
 *                are tolerated. Empty map → xml returned unchanged.
 * @returns the rewritten XML
 */
export function rewriteCells(
  xml: string,
  patches: Map<string, (open: string, body: string) => CellPatch | null>,
): string {
  if (patches.size === 0) return xml;
  const cells = scanCellSpans(xml);
  if (cells.length === 0) return xml;
  const out: string[] = [];
  let cursor = 0;
  for (const c of cells) {
    out.push(xml.slice(cursor, c.openStart));
    const patch = patches.get(c.id);
    if (patch && !c.selfClosing && c.close >= 0) {
      const open = xml.slice(c.openStart, c.tagEnd);
      const body = xml.slice(c.tagEnd + 1, c.close);
      const result = patch(open, body);
      if (result) {
        out.push(`${result.open}>${result.body}${CLOSE}`);
      } else {
        out.push(xml.slice(c.openStart, c.close + CLOSE_LEN));
      }
      cursor = c.close + CLOSE_LEN;
    } else {
      const segEnd = c.close >= 0 ? c.close + CLOSE_LEN : c.tagEnd + 1;
      out.push(xml.slice(c.openStart, segEnd));
      cursor = segEnd;
    }
  }
  out.push(xml.slice(cursor));
  return out.join('');
}

/** Scan all <mxCell …>…</mxCell> segments in one forward pass. */
function scanCellSpans(xml: string): CellSpan[] {
  const cells: CellSpan[] = [];
  const openTag = /<mxCell\s/g;
  let m: RegExpExecArray | null;
  while ((m = openTag.exec(xml)) !== null) {
    const attrsStart = m.index + m[0].length;
    const tagEnd = xml.indexOf('>', attrsStart);
    if (tagEnd < 0) break;
    const selfClosing = xml[tagEnd - 1] === '/';
    if (selfClosing) {
      cells.push(span(m.index, tagEnd, -1, xml, true));
      openTag.lastIndex = tagEnd + 1;
      continue;
    }
    const close = xml.indexOf(CLOSE, tagEnd + 1);
    if (close < 0) {
      cells.push(span(m.index, tagEnd, -1, xml, false));
      openTag.lastIndex = tagEnd + 1;
      continue;
    }
    cells.push(span(m.index, tagEnd, close, xml, false));
    openTag.lastIndex = close + CLOSE_LEN;
  }
  return cells;
}

function span(openStart: number, tagEnd: number, close: number, xml: string, selfClosing: boolean): CellSpan {
  return {
    id: attrId(xml, openStart + '<mxCell '.length, selfClosing ? tagEnd - 1 : tagEnd),
    openStart, tagEnd, close, selfClosing,
  };
}

/** Extract the id attribute from a cell's attribute span [start, end). */
function attrId(xml: string, start: number, end: number): string {
  const m = /id="([^"]*)"/.exec(xml.slice(start, end));
  return m ? m[1] : '';
}
