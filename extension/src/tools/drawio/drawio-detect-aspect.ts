/**
 * SA4E-406 — extreme aspect ratio: a long chain drawn as one strip
 * (e.g. 20 steps in a 224×4272 px column) has no overlap or crossing, yet is
 * unreadable at any zoom. The layout engine fixes it by wrapping the flow into
 * several rows/columns.
 *
 * Only flat diagrams are judged (bands and lanes legitimately grow long, e.g. a
 * swimlane timeline). Larger ones use a ratio of 4, small ones a laxer 8: a short
 * row of boxes is fine, a sliver is not.
 */

import type { DiagramGraph } from './drawio-parser';
import type { Rect } from './drawio-geometry';
import { absoluteRects } from './drawio-geometry';
import type { LayoutIssue } from './drawio-detect';

/** Fewer nodes than this are never worth wrapping (a chain needs this many steps to be worth folding). */
export const WRAP_MIN_NODES = 8;
/** Longest side : shortest side beyond which a flat diagram of WRAP_MIN_NODES+ nodes counts as a strip. */
export const ASPECT_LIMIT = 4;
/**
 * Same, for a diagram with only a few nodes. A handful of boxes may sit in a short row,
 * but a ratio this extreme means some of them were left far away from the rest.
 */
export const SMALL_DIAGRAM_ASPECT_LIMIT = 8;

/** True when width:height (or its inverse) exceeds the readability limit for a diagram of 
odeCount nodes. */
export function isExtremeAspect(width: number, height: number, nodeCount = WRAP_MIN_NODES): boolean {
  if (width <= 0 || height <= 0) return false;
  const limit = nodeCount >= WRAP_MIN_NODES ? ASPECT_LIMIT : SMALL_DIAGRAM_ASPECT_LIMIT;
  const ratio = width / height;
  return ratio > limit || ratio < 1 / limit;
}

/** One medium issue when a flat diagram is laid out as a strip. */
export function detectExtremeAspect(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  if (graph.containers.length > 0 || graph.nodes.length < 2) return [];
  const rects = abs ?? absoluteRects(graph);
  const list = graph.nodes.map(n => rects.get(n.id)!).filter(Boolean);
  const w = Math.max(...list.map(r => r.x + r.w)) - Math.min(...list.map(r => r.x));
  const h = Math.max(...list.map(r => r.y + r.h)) - Math.min(...list.map(r => r.y));
  if (!isExtremeAspect(w, h, graph.nodes.length)) return [];
  return [{
    type: 'extreme_aspect_ratio', severity: 'medium',
    width: Math.round(w), height: Math.round(h),
    fix_hint: `Diagram is ${Math.round(w)}×${Math.round(h)} px — relayout wraps the flow into several rows/columns.`,
  }];
}
