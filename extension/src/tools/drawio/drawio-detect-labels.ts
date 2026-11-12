/**
 * SA4E-406 — edge label placement detector. draw.io draws an edge label at the
 * middle of the edge's course (by length). A label landing on a swimlane title
 * strip hides the layer title — a real defect the geometry detectors miss.
 */

import type { DiagramEdge, DiagramGraph } from './drawio-parser';
import type { LayoutIssue } from './drawio-detect';
import type { Point, Rect } from './drawio-geometry';
import { absoluteRects, overlapRatio } from './drawio-geometry';
import { headerThickness, isSwimlane, titleOnTop } from './drawio-container-insets';
import { isSequenceLifeline } from './drawio-style';
import { polylineCache } from './drawio-detect-edge-utils';

/** draw.io default edge label font size (px). */
const DEFAULT_FONT = 11;
/** Average glyph width as a fraction of the font size (Helvetica-like). */
const GLYPH_RATIO = 0.6;
/** Line height as a multiple of the font size. */
const LINE_RATIO = 1.3;
/** Clearance (px) a label must keep below/right of a swimlane title strip. */
const HEADER_PAD = 6;

/**
 * Edge labels whose box overlaps the title strip of a swimlane (severity medium).
 * @param graph Parsed diagram
 * @param abs Optional precomputed absolute rects
 * @returns One issue per (edge, swimlane) collision
 */
export function detectLabelOnHeader(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const headers = headerRects(graph, rects);
  if (headers.length === 0) return [];
  const lines = polylineCache(graph, rects);
  const issues: LayoutIssue[] = [];
  for (const edge of graph.edges) {
    const line = lines.get(edge.id);
    const box = line ? labelBox(edge, line) : null;
    if (!box) continue;
    for (const h of headers) {
      // A relation drawn ON the box itself (class/ER) may legitimately label its header
      if (h.id === edge.sourceId || h.id === edge.targetId || overlapRatio(box, h.rect) <= 0) continue;
      issues.push({
        type: 'edge_label_on_header', severity: 'medium', edge_id: edge.id, container: h.id,
        fix_hint: `Label of edge '${edge.id}' covers the title of '${h.id}' — move an endpoint or reroute.`,
      });
    }
  }
  return issues;
}

/** Ancestor-or-self ids of `endpointId` along the parent chain (cycle-safe). */
function ancestorsOf(graph: DiagramGraph, endpointId: string): Set<string> {
  const parentOf = new Map([...graph.nodes, ...graph.containers].map(c => [c.id, c.parentId] as const));
  const out = new Set<string>();
  let cur: string | undefined = endpointId;
  while (cur !== undefined && !out.has(cur)) {
    out.add(cur);
    cur = parentOf.get(cur);
  }
  return out;
}

/** Ancestor-or-self ids of BOTH endpoints of `edge` — the boxes a label may rest on. */
export function labelHosts(graph: DiagramGraph, edge: DiagramEdge): Set<string> {
  const host = ancestorsOf(graph, edge.sourceId);
  for (const a of ancestorsOf(graph, edge.targetId)) host.add(a);
  return host;
}

/** True when `box` may host the label of `edge`: not an endpoint's container and not a lifeline. */
function mayHostLabel(style: string, id: string, endpoints: Set<string>): boolean {
  return !endpoints.has(id) && !isSequenceLifeline(style);
}

/**
 * Edge labels drawn over a box other than the edge's own endpoints (severity medium):
 * the text collides with the box border or content. Boxes that CONTAIN either
 * endpoint and sequence lifelines are exempt: a label resting on its own
 * endpoint's container (or on a lifeline it crosses) is not a collision
 * (SA4E-406: shipped sequence diagrams raised 2 phantom issues each).
 * @param graph Parsed diagram
 * @param abs Optional precomputed absolute rects
 */
export function detectLabelOnNode(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const lines = polylineCache(graph, rects);
  const issues: LayoutIssue[] = [];
  for (const edge of graph.edges) {
    const line = lines.get(edge.id);
    const box = line ? labelBox(edge, line) : null;
    if (!box) continue;
    const host = labelHosts(graph, edge);
    for (const n of graph.nodes) {
      const r = rects.get(n.id);
      if (!r || !mayHostLabel(n.style, n.id, host) || overlapRatio(shrink(box), r) <= 0) continue;
      issues.push({
        type: 'edge_label_on_node', severity: 'medium', edge_id: edge.id, node: n.id,
        fix_hint: `Label of edge '${edge.id}' is drawn over '${n.id}' — move an endpoint or reroute.`,
      });
    }
  }
  return issues;
}

/** The label box estimate is approximate: only a real collision (beyond 2 px) counts. */
function shrink(r: Rect, by = 2): Rect {
  return { x: r.x + by, y: r.y + by, w: Math.max(0, r.w - 2 * by), h: Math.max(0, r.h - 2 * by) };
}

/**
 * Number of swimlane titles and foreign boxes a label box would cover — the
 * same rules as the two detectors, shared with the label placer. Node hits
 * exempt the endpoint ancestor chain and lifelines; header hits keep every
 * non-endpoint strip (a label over any title strip hides it).
 */
export function labelHits(
  box: Rect, edge: DiagramEdge, graph: DiagramGraph, rects: Map<string, Rect>,
  headers: Array<{ id: string; rect: Rect }>, host = labelHosts(graph, edge),
): number {
  const own = (id: string) => id === edge.sourceId || id === edge.targetId;
  const onHeader = headers.filter(h => !own(h.id) && overlapRatio(box, h.rect) > 0).length;
  const onNode = graph.nodes.filter(n =>
    !host.has(n.id) && !isSequenceLifeline(n.style)
    && rects.has(n.id) && overlapRatio(shrink(box), rects.get(n.id)!) > 0,
  ).length;
  return onHeader + onNode;
}

/** Absolute title-strip rect of every swimlane container. */
export function headerRects(graph: DiagramGraph, rects: Map<string, Rect>): Array<{ id: string; rect: Rect }> {
  return graph.containers.filter(c => isSwimlane(c.style) && rects.has(c.id)).map(c => {
    // The strip is padded on its content side: a label touching the title border still reads as on it
    const r = rects.get(c.id)!, t = headerThickness(c.style) + HEADER_PAD;
    return { id: c.id, rect: titleOnTop(c.style) ? { ...r, h: t } : { ...r, w: t } };
  });
}

/**
 * Approximate rendered label box, centred on the polyline midpoint.
 * @returns null for unlabeled edges or degenerate polylines
 */
export function labelBox(edge: DiagramEdge, line: Point[], pos = edge.labelPos ?? 0): Rect | null {
  const text = plainLines(edge.label ?? '');
  if (text.length === 0 || line.length < 2) return null;
  const font = Number(/(?:^|;)fontSize=([\d.]+)/.exec(edge.style)?.[1] ?? DEFAULT_FONT);
  const w = Math.max(...text.map(t => t.length)) * font * GLYPH_RATIO;
  const h = text.length * font * LINE_RATIO;
  const at = pointAlong(line, (pos + 1) / 2);
  return { x: at.x - w / 2, y: at.y - h / 2, w, h };
}

/** Visible label lines: HTML/entities stripped, empty lines dropped. */
function plainLines(raw: string): string[] {
  return raw.replace(/<br\s*\/?>|&#xa;|&#10;|\n/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&[#\w]+;/g, ' ').split('\n').map(s => s.trim()).filter(s => s.length > 0);
}

/** Point at fraction `f` (0 = start, 1 = end) of the polyline, measured by length. */
function pointAlong(line: Point[], f: number): Point {
  const seg = line.slice(1).map((p, i) => Math.hypot(p.x - line[i].x, p.y - line[i].y));
  let left = seg.reduce((a, b) => a + b, 0) * f;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] && seg[i] > 0) {
      const t = left / seg[i], a = line[i], b = line[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= seg[i];
  }
  return line[line.length - 1];
}
