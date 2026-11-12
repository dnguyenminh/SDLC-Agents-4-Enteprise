/**
 * SA4E-406 — edge label placement. draw.io centres an edge label on the middle
 * of the edge; on long edges that middle often falls on a box or a layer title.
 * The label may sit anywhere along the edge (mxGeometry x: -1 … 1), so slide it
 * to the clear spot closest to the middle. Edges whose middle is clear are left
 * untouched (idempotent).
 */

import type { DiagramGraph } from './drawio-parser';
import { parseDrawioXml } from './drawio-parser';
import { absoluteRects } from './drawio-geometry';
import { polylineCache } from './drawio-detect-edge-utils';
import { headerRects, labelBox, labelHits, labelHosts } from './drawio-detect-labels';
import { patchGeometryTag, hasAttr, replaceAttr, insertAttrs, round } from './drawio-xml-utils';
import { rewriteCells, type CellPatch } from './drawio-xml-rewrite';

/** Candidate positions, nearest the middle first; ±0.8 keeps the label off the arrow ends.
 * The ordering IS the tie-break: equal-hit candidates resolve to the smallest
 * |pos|, negative before positive (deterministic, order-independent result). */
const POSITIONS = [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3, -0.4, 0.4, -0.5, 0.5, -0.6, 0.6, -0.7, 0.7, -0.8, 0.8];

/**
 * Move every colliding edge label to the clear position nearest the middle.
 * @param xml Diagram XML whose edges are already routed
 * @returns XML with updated label positions (input returned when nothing moves)
 */
export function placeLabels(xml: string): string {
  const graph = parseDrawioXml(xml);
  const moves = chooseLabelPositions(graph);
  if (moves.size === 0) return xml;
  const patches = new Map<string, (open: string, body: string) => CellPatch | null>();
  for (const [id, pos] of moves) {
    patches.set(id, (_open, body) => {
      const patched = patchGeometryTag(body, (tag) => {
        let out = hasAttr(tag, 'x') ? replaceAttr(tag, 'x', pos) : insertAttrs(tag, ` x="${round(pos)}"`);
        return out;
      });
      return patched === null ? null : { open: _open, body: patched };
    });
  }
  return rewriteCells(xml, patches);
}

/** Edge id → new label position, only for edges whose current position collides.
 * Keys are the cell whose geometry must change: the edgeLabel child when the
 * label lives there, else the edge itself (draw.io child-form labels, SA4E-406). */
export function chooseLabelPositions(graph: DiagramGraph): Map<string, number> {
  const rects = absoluteRects(graph);
  const headers = headerRects(graph, rects);
  const lines = polylineCache(graph, rects);
  const moves = new Map<string, number>();
  for (const edge of graph.edges) {
    const line = lines.get(edge.id);
    const host = labelHosts(graph, edge);
    // One scoring pass per edge: hit counts are cached, not recomputed per comparison
    const hitsAt = (pos: number): number => {
      const box = line ? labelBox(edge, line, pos) : null;
      return box ? labelHits(box, edge, graph, rects, headers, host) : 0;
    };
    const current = edge.labelPos ?? 0;
    const scored = [{ pos: current, hits: hitsAt(current) }, ...POSITIONS.map(p => ({ pos: p, hits: hitsAt(p) }))];
    if (scored[0].hits === 0) continue;
    // Clear spot nearest the middle, else the least-covered one; strict < keeps
    // the incumbent on ties (idempotent, no order dependence)
    const best = scored.slice(1).reduce((b, c) => (c.hits < b.hits ? c : b), scored[0]);
    if (best.pos !== current) moves.set(edge.labelCellId ?? edge.id, best.pos);
  }
  return moves;
}
