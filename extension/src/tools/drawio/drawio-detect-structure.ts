/**
 * SA4E-406 — structural layout-issue detectors that the geometry detectors miss:
 * off-grid vertices (f), empty swimlane titles (g), unlabelled decision edges (h),
 * oversized bands (a) and edges parented outside their endpoint scope (qa B2).
 * All use absolute rects (see drawio-geometry.ts).
 */

import type { DiagramEdge, DiagramGraph } from './drawio-parser';
import { GRID_STEP, absoluteRects, ancestorsOf, cellIndex } from './drawio-geometry';
import type { Rect } from './drawio-geometry';
import { isSwimlane } from './drawio-container-insets';
import type { LayoutIssue } from './drawio-detect';

export { GRID_STEP } from './drawio-geometry';
/** Snap slack: coordinates are written rounded, compare with the same rounding. */
const GRID_EPS = 0.01;
/** A band counts as oversized below this content-fill fraction. */
const MIN_FILL = 0.2;
/** …and only when it is at least this big (px²) — small bands are noise. */
const MIN_BAND_AREA = 60_000;

/**
 * Issue types the tool DETECTS but never rewrites the file for: they are
 * content decisions (naming a lane, wording a branch) or writer-invariants the
 * layout already sizes correctly. They still count into remaining_issues so
 * the report stays honest (SA4E-406 g/a).
 */
export const REPORT_ONLY_ISSUE_TYPES: ReadonlySet<string> = new Set([
  'empty_lane_title', 'missing_decision_label', 'band_oversize',
]);

/**
 * Vertices whose x/y are not multiples of the 10 px grid (severity medium).
 * @param graph Parsed diagram
 * @param abs Optional precomputed absolute rects
 */
export function detectOffGrid(graph: DiagramGraph, abs?: Map<string, Rect>, step = GRID_STEP): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const issues: LayoutIssue[] = [];
  for (const cell of [...graph.nodes, ...graph.containers]) {
    const r = rects.get(cell.id);
    if (!r || onGrid(r.x, step) && onGrid(r.y, step)) continue;
    issues.push({
      type: 'off_grid', severity: 'medium', node: cell.id,
      x: Math.round(r.x), y: Math.round(r.y),
      fix_hint: `Vertex '${cell.id}' sits at (${Math.round(r.x)}, ${Math.round(r.y)}) off the ${step}px grid.`,
    });
  }
  return issues;
}

function onGrid(v: number, step: number): boolean {
  return Math.abs(v - Math.round(v / step) * step) <= GRID_EPS;
}

/** Swimlanes whose title strip has no text (severity medium) — naming is a content decision. */
export function detectEmptyLaneTitles(graph: DiagramGraph): LayoutIssue[] {
  return graph.containers
    .filter(c => isSwimlane(c.style) && plainText(c.label ?? '') === '')
    .map(c => ({
      type: 'empty_lane_title', severity: 'medium' as const, container: c.id,
      fix_hint: `Swimlane '${c.id}' has an empty title — name the lane (actor/phase).`,
    }));
}

/** Edges leaving a rhombus decision node without a branch label (severity medium). */
export function detectMissingDecisionLabels(graph: DiagramGraph): LayoutIssue[] {
  const decisions = new Set(
    [...graph.nodes, ...graph.containers].filter(n => isRhombus(n.style)).map(n => n.id),
  );
  const issues: LayoutIssue[] = [];
  for (const edge of graph.edges) {
    if (!decisions.has(edge.sourceId) || plainText(edge.label ?? '') !== '') continue;
    issues.push({
      type: 'missing_decision_label', severity: 'medium', edge_id: edge.id, node: edge.sourceId,
      fix_hint: `Edge '${edge.id}' leaves decision '${edge.sourceId}' without a Yes/No branch label.`,
    });
  }
  return issues;
}

function isRhombus(style: string): boolean {
  return /(?:^|;)(?:rhombus|shape=rhombus|shape=mxgraph\.flowchart\.decision)(?:;|$)/i.test(style);
}

/**
 * Containers far bigger than their content (severity medium): the fill ratio of
 * the direct children's bounding box inside the band. Keeps remaining_issues
 * honest about the "giant band, children in the corner" defect.
 *
 * Swimlanes are EXCLUDED (SA4E-406 a): in a lane flow every lane shares the
 * flow length by design (drawio-humanize-lanes), so a mostly empty lane is the
 * idiom working, not an oversize defect.
 */
export function detectBandOversize(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const issues: LayoutIssue[] = [];
  for (const c of graph.containers) {
    if (isSwimlane(c.style)) continue;
    const kids = [...graph.nodes, ...graph.containers].filter(k => k.parentId === c.id);
    const rc = rects.get(c.id);
    if (!rc || kids.length === 0) continue;
    const box = contentBox(kids, rects);
    if (!box) continue;
    const fill = (box.w * box.h) / (rc.w * rc.h);
    if (rc.w * rc.h >= MIN_BAND_AREA && fill < MIN_FILL) {
      issues.push({
        type: 'band_oversize', severity: 'medium', container: c.id,
        fill: Math.round(fill * 100) / 100,
        fix_hint: `Band '${c.id}' is only ${Math.round(fill * 100)}% filled by its ${kids.length} child(ren) — resize it to its content.`,
      });
    }
  }
  return issues;
}

function contentBox(kids: Array<{ id: string }>, rects: Map<string, Rect>): Rect | null {
  const rs = kids.map(k => rects.get(k.id)).filter((r): r is Rect => r !== undefined);
  if (rs.length === 0) return null;
  const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y));
  return {
    x, y,
    w: Math.max(...rs.map(r => r.x + r.w)) - x,
    h: Math.max(...rs.map(r => r.y + r.h)) - y,
  };
}

/**
 * Edges whose parent is not the lowest common container of their endpoints
 * (severity medium): draw.io interprets their waypoints in the wrong coordinate
 * space, so cross-lane edges render displaced. Mirrors drawio-edge-plan.parentOf.
 */
export function detectEdgeWrongParent(graph: DiagramGraph): LayoutIssue[] {
  const byId = cellIndex(graph);
  const issues: LayoutIssue[] = [];
  for (const edge of graph.edges) {
    if (!routable(edge, byId)) continue;
    const expected = commonParent(edge, byId);
    if (edge.parentId === expected) continue;
    issues.push({
      type: 'edge_wrong_parent', severity: 'medium', edge_id: edge.id,
      parent: edge.parentId, expected,
      fix_hint: `Edge '${edge.id}' is parented to '${edge.parentId}' but its endpoints live under '${expected}'.`,
    });
  }
  return issues;
}

/** Both ends exist, differ, and are not in an ancestor/descendant relation. */
function routable(e: DiagramEdge, byId: ReturnType<typeof cellIndex>): boolean {
  if (!e.sourceId || !e.targetId || e.sourceId === e.targetId) return false;
  if (!byId.has(e.sourceId) || !byId.has(e.targetId)) return false;
  return !ancestorsOf(e.sourceId, byId).has(e.targetId) && !ancestorsOf(e.targetId, byId).has(e.sourceId);
}

/** Lowest common container of both ends ('1' when only the root is shared). */
function commonParent(e: DiagramEdge, byId: ReturnType<typeof cellIndex>): string {
  const srcChain = ancestorsOf(e.sourceId, byId);
  for (let cur = byId.get(e.targetId)?.parentId; cur && byId.has(cur); cur = byId.get(cur)?.parentId) {
    if (srcChain.has(cur)) return cur;
  }
  return '1';
}

/** Visible text of a label value: HTML/entities stripped, whitespace trimmed. */
function plainText(raw: string): string {
  return raw.replace(/<[^>]*>/g, ' ').replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim();
}
