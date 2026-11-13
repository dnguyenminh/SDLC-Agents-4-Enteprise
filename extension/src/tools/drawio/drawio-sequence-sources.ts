/**
 * SA4E-406 — where things were in the ORIGINAL sequence file: shapes (including those nested in
 * container frames) with absolute geometry, the y of every message, and dividers drawn as edges.
 */

import type { DiagramEdge } from './drawio-parser';
import { DIVIDER_MAX_H, isFragmentCell } from './drawio-sequence-fragments';
import type { TCell } from './drawio-table-cells';

/** A divider edge is at least this long (px). */
const DIVIDER_MIN_W = 40;
/** A shape at least this tall that sends/receives messages stands for a lifeline. */
const TALL_LIFELINE = 150;

type Origin = { x: number; y: number };
/** Absolute origin of a parent cell when it is the root or a chain of fragment frames; null otherwise. */
function originOf(parentId: string, byId: Map<string, TCell>): Origin | null {
  let x = 0, y = 0, cur = parentId;
  for (let depth = 0; depth < 20; depth++) {
    if (cur === '1' || cur === '') return { x, y };
    const p = byId.get(cur);
    if (!p || p.edge || !isFragmentCell(p)) return null;
    x += p.geo.x ?? 0;
    y += p.geo.y ?? 0;
    cur = p.parent;
  }
  return null;
}

/**
 * Top-level shapes and shapes nested in fragment frames, with ABSOLUTE geometry.
 * @param skip - ids that are not furniture (participants)
 * @returns the shapes and a lookup of a parent's absolute origin (null when it is not root / a frame)
 */
export function collectShapes(cells: TCell[], skip: Set<string>): { shapes: TCell[]; originOf: (parentId: string) => Origin | null } {
  const byId = new Map(cells.map(c => [c.id, c]));
  const shapes = cells.flatMap(c => {
    if (c.edge || skip.has(c.id) || c.id === '0' || c.id === '1') return [];
    const o = originOf(c.parent, byId);
    if (!o) return [];
    return [{ ...c, geo: { ...c.geo, x: (c.geo.x ?? 0) + o.x, y: (c.geo.y ?? 0) + o.y } }];
  });
  return { shapes, originOf: (parentId: string) => originOf(parentId, byId) };
}

/**
 * Original y of a message: terminal point, anchor fraction on a lifeline-like source, or waypoint.
 * @param originY - absolute y of the edge's parent (0 for the root); null when the parent is not usable
 * @returns null when the file gives no usable position
 */
export function originalMessageY(edge: DiagramEdge | undefined, source: TCell | undefined, originY: number | null): number | null {
  if (!edge || originY === null) return null;
  if (edge.sourcePoint) return originY + edge.sourcePoint.y;
  const g = source?.geo;
  const lifelineLike = source !== undefined && (/umlLifeline/.test(source.style) || (g?.height ?? 0) >= TALL_LIFELINE);
  if (edge.exit && lifelineLike && g?.y !== undefined && g.height) return g.y + edge.exit.y * g.height;
  if (edge.points.length) return originY + edge.points[0].y;
  return edge.targetPoint ? originY + edge.targetPoint.y : null;
}

/**
 * A horizontal edge without terminals, as a thin pseudo-shape (absolute rect) for the divider search.
 * @returns undefined when the edge is not a divider candidate
 */
export function dividerFromEdge(e: DiagramEdge, origin: Origin | null): { cell: TCell; reverse: boolean } | undefined {
  const [s, t] = [e.sourcePoint, e.targetPoint];
  if (!s || !t || !origin || Math.abs(s.y - t.y) > DIVIDER_MAX_H || Math.abs(s.x - t.x) < DIVIDER_MIN_W) return undefined;
  const geo = { x: Math.min(s.x, t.x) + origin.x, y: Math.min(s.y, t.y) + origin.y, width: Math.abs(s.x - t.x), height: Math.abs(s.y - t.y) };
  return { cell: { id: e.id, parent: e.parentId, style: e.style, value: '', edge: false, geo, source: '', target: '' }, reverse: s.x > t.x };
}
