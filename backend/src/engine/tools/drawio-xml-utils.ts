/**
 * Low-level draw.io XML patchers shared by the ELK writer and the local-repair
 * patcher. All functions locate a cell by id and patch only that cell, keeping
 * the rest of the document byte-identical.
 */

export interface Point { x: number; y: number; }

export interface CellPatch {
  open: string; // "<mxCell attr=..." without the closing ">"
  body: string; // inner XML between "<mxCell ...>" and "</mxCell>"
}

/** Escape a cell id for safe embedding in a RegExp. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Locate a cell by id and patch it.
 * @param patch receives the open tag (without '>') and inner body;
 *              return null to leave the cell untouched
 */
export function patchCell(
  xml: string, id: string, patch: (open: string, body: string) => CellPatch | null,
): string {
  const cellRegex = new RegExp(`(<mxCell\\b[^>]*\\bid="${escapeRegex(id)}"[^>]*?)(\\/>|>)([\\s\\S]*?)<\\/mxCell>`);
  return xml.replace(cellRegex, (whole, open: string, end: string, body: string) => {
    if (end === '/>') return whole; // self-closing cell has no geometry body
    const result = patch(open, body);
    return result ? `${result.open}>${result.body}</mxCell>` : whole;
  });
}

/** Set (or insert) a cell's geometry x/y. Works when x/y attributes are missing. */
export function replaceCellGeometryXy(xml: string, id: string, x: number, y: number): string {
  return patchCell(xml, id, (_open, body) => {
    const patched = patchGeometryTag(body, (tag) => {
      let out = hasAttr(tag, 'x') ? replaceAttr(tag, 'x', x) : insertAttrs(tag, ` x="${round(x)}"`);
      out = hasAttr(out, 'y') ? replaceAttr(out, 'y', y) : insertAttrs(out, ` y="${round(y)}"`);
      return out;
    });
    return patched === null ? null : { open: _open, body: patched };
  });
}

/** Set a cell's geometry width/height (used to grow containers). */
export function replaceCellSize(xml: string, id: string, w: number, h: number): string {
  return patchCell(xml, id, (open, body) => {
    const patched = patchGeometryTag(body, (tag) => {
      let out = hasAttr(tag, 'width') ? replaceAttr(tag, 'width', w) : tag;
      out = hasAttr(out, 'height') ? replaceAttr(out, 'height', h) : out;
      return out;
    });
    return patched === null ? null : { open, body: patched };
  });
}

/** Replace an edge's stored waypoints with the given points (edge-parent space). */
export function setEdgePointsXml(xml: string, edgeId: string, points: Point[]): string {
  const pointsXml = points.map(p => `<mxPoint x="${round(p.x)}" y="${round(p.y)}"/>`).join('');
  const array = points.length > 0 ? `<Array as="points">${pointsXml}</Array>` : '';
  return patchCell(xml, edgeId, (open, body) => {
    const geomRegex = /<mxGeometry\b([^>]*?)(\/>|>([\s\S]*?)<\/mxGeometry>)/;
    const geom = geomRegex.exec(body);
    if (!geom) return null;
    const [full, attrs, ending, inner = ''] = geom;
    const cleaned = inner
      .replace(/<Array\s+as="points"\s*\/>/g, '')
      .replace(/<Array\s+as="points">[\s\S]*?<\/Array>/g, '');
    const replacement = ending === '/>'
      ? (array ? `<mxGeometry${attrs}>${array}</mxGeometry>` : full)
      : `<mxGeometry${attrs}>${cleaned}${array}</mxGeometry>`;
    return { open, body: `${body.slice(0, geom.index)}${replacement}${body.slice(geom.index + full.length)}` };
  });
}

/** Upsert style keys on a cell (existing values for the same keys are removed). */
export function upsertEdgeStyleKeys(xml: string, id: string, keys: Record<string, string | number>): string {
  return patchCell(xml, id, (open, body) => {
    const styleMatch = /style="([^"]*)"/.exec(open);
    if (!styleMatch) return null;
    let style = styleMatch[1];
    for (const key of Object.keys(keys)) {
      style = style.replace(new RegExp(`${key}=[^;]*;?`, 'g'), '');
    }
    const additions = Object.entries(keys).map(([k, v]) => `${k}=${v};`).join('');
    const newOpen = open.replace(/style="[^"]*"/, `style="${style}${additions}"`);
    return { open: newOpen, body };
  });
}

/** Apply a transform to the first <mxGeometry ...> tag inside a cell body. */
function patchGeometryTag(body: string, transform: (tag: string) => string): string | null {
  const geomRegex = /<mxGeometry\b[^>]*?(?:\/>|>)/;
  const geom = geomRegex.exec(body);
  if (!geom) return null;
  return `${body.slice(0, geom.index)}${transform(geom[0])}${body.slice(geom.index + geom[0].length)}`;
}

function hasAttr(tag: string, name: string): boolean {
  return new RegExp(`\\s${name}="`).test(tag);
}

function replaceAttr(tag: string, name: string, value: number): string {
  return tag.replace(new RegExp(`\\s${name}="[^"]*"`), ` ${name}="${round(value)}"`);
}

function insertAttrs(tag: string, attrs: string): string {
  // Insert before the trailing "/>" or ">" of the mxGeometry tag
  const m = /(\s*\/?>)$/.exec(tag);
  const cut = m ? tag.length - m[0].length : tag.length;
  return `${tag.slice(0, cut)}${attrs}${tag.slice(cut)}`;
}

function round(v: number): number { return Math.round(v * 10) / 10; }
