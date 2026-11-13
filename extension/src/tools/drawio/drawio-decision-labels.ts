/**
 * SA4E-406 (h) — apply Yes/No branch labels to decision edges WHEN the branch
 * geometry makes the assignment unambiguous; otherwise the edges stay unlabeled
 * and the detector's medium issue remains in the output (report only).
 *
 * Unambiguous = the decision node has EXACTLY two out-edges, both unlabeled,
 * and their targets clearly diverge (the angle between the two exit vectors is
 * at least MIN_DIVERGENCE). The branch that continues the flow direction
 * (down; horizontal tie → right) gets "Yes", the other gets "No" — the usual
 * flowchart reading of a condition gate.
 */

import type { DiagramEdge, DiagramGraph, DiagramNode } from './drawio-parser';
import { patchCell } from './drawio-xml-utils';

/** Exit vectors at least this far apart count as clearly divergent (degrees). */
const MIN_DIVERGENCE = 60;

/** One pending branch label: edge id + the label to write. */
interface BranchLabel { edgeId: string; label: 'Yes' | 'No'; }

/**
 * Label unambiguous decision branches in the given XML.
 * @returns the XML unchanged when nothing qualifies (byte-identical).
 */
export function applyDecisionLabels(xml: string, graph: DiagramGraph): string {
  const labels = planDecisionLabels(graph);
  let out = xml;
  for (const { edgeId, label } of labels) {
    out = setEdgeLabel(out, edgeId, label);
  }
  return out;
}

/** Yes/No assignments for every unambiguous decision in the graph. */
export function planDecisionLabels(graph: DiagramGraph): BranchLabel[] {
  const byId = cellMap(graph);
  const outEdges = outEdgesBySource(graph, byId);
  const out: BranchLabel[] = [];
  for (const [sourceId, edges] of outEdges) {
    const source = byId.get(sourceId)!;
    if (!isDecision(source) || edges.length !== 2) continue;
    if (edges.some(e => hasText(e.label))) continue;
    const [a, b] = [targetCenter(edges[0], byId), targetCenter(edges[1], byId)];
    if (!a || !b) continue;
    if (divergenceDeg(source, a, b) < MIN_DIVERGENCE) continue;
    const yesEdge = inFlowEdge(source, a, b) === a ? edges[0] : edges[1];
    const noEdge = yesEdge === edges[0] ? edges[1] : edges[0];
    out.push({ edgeId: yesEdge.id, label: 'Yes' }, { edgeId: noEdge.id, label: 'No' });
  }
  return out;
}

/** Out-edges grouped by source, only edges whose endpoints both resolve. */
function outEdgesBySource(
  graph: DiagramGraph, byId: Map<string, DiagramNode>,
): Map<string, DiagramEdge[]> {
  const map = new Map<string, DiagramEdge[]>();
  for (const e of graph.edges) {
    if (!byId.has(e.sourceId) || !byId.has(e.targetId) || e.sourceId === e.targetId) continue;
    const list = map.get(e.sourceId) ?? [];
    list.push(e);
    map.set(e.sourceId, list);
  }
  return map;
}

/** Center of an edge's target rect (absolute), or null when unknown. */
function targetCenter(e: DiagramEdge, byId: Map<string, DiagramNode>): { x: number; y: number } | null {
  const t = byId.get(e.targetId);
  return t ? { x: t.x + t.width / 2, y: t.y + t.height / 2 } : null;
}

/** Angle in degrees between the two exit vectors from the decision center. */
function divergenceDeg(source: DiagramNode, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const c = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const v1 = { x: a.x - c.x, y: a.y - c.y };
  const v2 = { x: b.x - c.x, y: b.y - c.y };
  const n1 = Math.hypot(v1.x, v1.y), n2 = Math.hypot(v2.x, v2.y);
  if (n1 === 0 || n2 === 0) return 0;
  const cos = (v1.x * v2.x + v1.y * v2.y) / (n1 * n2);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}

/** The branch that continues the flow (down, tie → right) — it becomes "Yes". */
function inFlowEdge(source: DiagramNode, a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  if (a.y !== b.y) return a.y > b.y ? a : b;
  return a.x > b.x ? a : b;
}

function isDecision(n: DiagramNode): boolean {
  return /(?:^|;)(?:rhombus|shape=rhombus|shape=mxgraph\.flowchart\.decision)(?:;|$)/i.test(n.style);
}

function hasText(label: string | undefined): boolean {
  return (label ?? '').replace(/<[^>]*>/g, ' ').replace(/&[#\w]+;/g, ' ').trim() !== '';
}

function cellMap(graph: DiagramGraph): Map<string, DiagramNode> {
  return new Map([...graph.nodes, ...graph.containers].map(n => [n.id, n]));
}

/** Set an edge's value attribute (escaped by the caller's plain-text label). */
function setEdgeLabel(xml: string, edgeId: string, label: string): string {
  return patchCell(xml, edgeId, (open, body) => {
    if (!/\svalue="/.test(open)) {
      return { open: open.replace(/(<mxCell\b)/, `$1 value="${label}"`), body };
    }
    return { open: open.replace(/\svalue="[^"]*"/, ` value="${label}"`), body };
  });
}
