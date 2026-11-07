/**
 * Edge polyline reconstruction — rebuilds the absolute render path of an edge
 * from exit/entry anchors, stored terminal points and waypoints.
 */

import type { DiagramEdge } from './drawio-parser.js';
import { perimeterTowards } from './drawio-geometry.js';
import type { Point, Rect } from './drawio-geometry.js';

/**
 * Reconstruct the absolute polyline of an edge:
 * [start anchor, ...absolute waypoints, end anchor].
 * Terminal hints (sourcePoint/targetPoint) are honored when present — they
 * carry the real attachment position (e.g. message y on UML lifelines).
 * Loose edges (no endpoint cells) are built purely from their stored points.
 * @param originOf - absolute (x, y) of the coordinate space of a parent cell
 */
export function edgePolyline(
  e: DiagramEdge, abs: Map<string, Rect>, originOf: (parentId: string) => Point,
): Point[] {
  const src = e.sourceId ? abs.get(e.sourceId) : undefined;
  const tgt = e.targetId ? abs.get(e.targetId) : undefined;
  const offset = originOf(e.parentId);
  const waypoints = e.points.map(p => ({ x: p.x + offset.x, y: p.y + offset.y }));
  const firstRef = waypoints[0] ?? (tgt ? center(tgt) : e.targetPoint ?? null);
  const lastRef = waypoints[waypoints.length - 1] ?? (src ? center(src) : e.sourcePoint ?? null);
  if (!firstRef || !lastRef) return [];
  const start = startAnchor(e, src, firstRef, offset);
  const end = endAnchor(e, tgt, lastRef, offset);
  if (!start || !end) return [];
  return [start, ...waypoints, end];
}

/** Start anchor: fixed exit > stored source point > floating perimeter. */
function startAnchor(
  e: DiagramEdge, src: Rect | undefined, ref: Point, offset: Point,
): Point | null {
  if (e.exit && src) return { x: src.x + e.exit.x * src.w, y: src.y + e.exit.y * src.h };
  if (e.sourcePoint) return { x: e.sourcePoint.x + offset.x, y: e.sourcePoint.y + offset.y };
  return src ? perimeterTowards(src, ref) : null;
}

/** End anchor: fixed entry > stored target point > floating perimeter. */
function endAnchor(
  e: DiagramEdge, tgt: Rect | undefined, ref: Point, offset: Point,
): Point | null {
  if (e.entry && tgt) return { x: tgt.x + e.entry.x * tgt.w, y: tgt.y + e.entry.y * tgt.h };
  if (e.targetPoint) return { x: e.targetPoint.x + offset.x, y: e.targetPoint.y + offset.y };
  return tgt ? perimeterTowards(tgt, ref) : null;
}

function center(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
