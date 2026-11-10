/**
 * SA4E-406 — swimlane (cross-functional flow) layout.
 *
 * In a business-flow chart the lanes are ACTORS and the flow runs ACROSS them
 * in time. Laying each lane out on its own (the generic band strategy) throws
 * that time order away and every hand-off becomes a long crossing edge. Here:
 *   1. one ELK layered run over ALL lane members gives each step its position
 *      along the flow axis (steps of consecutive hand-offs sit side by side);
 *   2. each lane keeps those flow positions and stacks overlapping steps into
 *      sub-rows, so a lane is as thin as its busiest moment;
 *   3. all lanes share one length and are stacked edge to edge, title strips
 *      aligned.
 * Flow axis: horizontal=0 lanes (title at left) run left→right; lanes with
 * the title on top become columns running top→bottom (computed transposed).
 */

import type { DiagramGraph, DiagramNode } from './drawio-parser';
import type { ElkNode, NormalizedArgs } from './drawio-layout-models';
import { flatPositions, type Pair } from './drawio-humanize-elk';
import { headerThickness, isSwimlane, titleOnTop } from './drawio-container-insets';

const MARGIN = 40;
// Cross-axis padding inside a lane. Edges entering a lane turn in this strip;
// at 20 px the only free line sat right under the lane separator and the edge
// read as part of the lane border. 40 px leaves a corridor clear of both.
const LANE_PAD = 40;
const FLOW_PAD = 30;
/** Gap between sub-rows of one lane: wide enough for an edge to leave/enter a node (margin + port stub + margin) and still pass. */
const ROW_GAP = 56;
const COL_GAP = 50;
const UNATTACHED_GAP = 40;
/** Share of edges that must cross lanes for the diagram to count as a lane flow. */
const CROSS_LANE_RATIO = 0.35;
/** Share of edges that must connect steps (not the lane containers) for a lane flow. */
const STEP_EDGE_RATIO = 0.6;

export interface LaneInfo { lanes: DiagramNode[]; vertical: boolean; }
interface Placed { node: DiagramNode; flow: number; cross: number; }
interface LanePlan { lane: DiagramNode; thick: number; placed: Placed[]; }
type Size = (n: DiagramNode) => { w: number; h: number };

/** Lane membership: swimlane children, plus root-level nodes attached through an edge. */
function assignLanes(graph: DiagramGraph, lanes: DiagramNode[]): { laneOf: Map<string, string>; unattached: DiagramNode[] } {
  const ids = new Set(lanes.map(l => l.id));
  const laneOf = new Map<string, string>();
  for (const n of graph.nodes) if (ids.has(n.parentId)) laneOf.set(n.id, n.parentId);
  const loose = graph.nodes.filter(n => !laneOf.has(n.id));
  for (let pass = 0; pass < 2; pass++) {
    for (const e of graph.edges) {
      const [a, b] = [e.sourceId, e.targetId];
      if (loose.some(n => n.id === a) && !laneOf.has(a) && laneOf.has(b)) laneOf.set(a, laneOf.get(b)!);
      if (loose.some(n => n.id === b) && !laneOf.has(b) && laneOf.has(a)) laneOf.set(b, laneOf.get(a)!);
    }
  }
  return { laneOf, unattached: loose.filter(n => !laneOf.has(n.id)) };
}

/** A lane flow = ≥2 root swimlanes holding only leaves, most edges crossing lanes. */
export function detectLanes(graph: DiagramGraph, args: NormalizedArgs): LaneInfo | null {
  const cells = new Set([...graph.nodes, ...graph.containers].map(c => c.id));
  const lanes = graph.containers.filter(c => isSwimlane(c.style) && !cells.has(c.parentId));
  if (lanes.length < 2 || lanes.length !== graph.containers.length || graph.edges.length === 0) return null;
  // In a lane flow the edges connect the STEPS inside lanes. Edges that connect
  // the containers themselves (UML class boxes, ER tables) describe relations
  // between boxes, not a process crossing actors.
  const laneIds = new Set(lanes.map(l => l.id));
  const stepEdges = graph.edges.filter(e => !laneIds.has(e.sourceId) && !laneIds.has(e.targetId));
  if (stepEdges.length / graph.edges.length < STEP_EDGE_RATIO) return null;
  const { laneOf } = assignLanes(graph, lanes);
  const crossing = stepEdges.filter(e => !laneOf.has(e.sourceId) || laneOf.get(e.sourceId) !== laneOf.get(e.targetId));
  if (crossing.length / stepEdges.length < CROSS_LANE_RATIO) return null;
  const dir = args.directionExplicit ? args.direction : null;
  const vertical = dir ? dir === 'DOWN' || dir === 'UP' : titleOnTop(lanes[0].style);
  return { lanes, vertical };
}

/** Synthetic laid-out ELK tree: lanes (absolute) holding their steps (lane-relative). */
export async function layoutLanes(
  graph: DiagramGraph, info: LaneInfo, args: NormalizedArgs, timeoutMs: number,
): Promise<ElkNode> {
  const { laneOf, unattached } = assignLanes(graph, info.lanes);
  const members = graph.nodes.filter(n => laneOf.has(n.id));
  const size: Size = n => (info.vertical ? { w: n.height, h: n.width } : { w: n.width, h: n.height });
  const pairs: Pair[] = graph.edges.map(e => [e.sourceId, e.targetId]);
  const pos = await flatPositions(
    members.map(n => ({ id: n.id, width: size(n).w, height: size(n).h })), pairs,
    { dir: 'RIGHT', algorithm: args.algorithm, nodeSpacing: 30, layerSpacing: COL_GAP, timeoutMs },
  );
  const plans = info.lanes.map(l => planLane(l, members.filter(n => laneOf.get(n.id) === l.id), pos, size));
  return assemble(plans, unattached, info.vertical, size);
}

/** Sub-row packing of one lane's steps along the flow axis. */
function planLane(
  lane: DiagramNode, nodes: DiagramNode[], pos: Map<string, { x: number; y: number }>, size: Size,
): LanePlan {
  const sorted = [...nodes].sort((a, b) => pos.get(a.id)!.x - pos.get(b.id)!.x || pos.get(a.id)!.y - pos.get(b.id)!.y);
  const rowEnd: number[] = [];
  const rowOf = new Map<string, number>();
  for (const n of sorted) {
    const x = pos.get(n.id)!.x;
    let r = rowEnd.findIndex(end => end + COL_GAP <= x);
    if (r < 0) { r = rowEnd.length; rowEnd.push(0); }
    rowEnd[r] = x + size(n).w;
    rowOf.set(n.id, r);
  }
  const rowH = Math.max(60, ...nodes.map(n => size(n).h));
  const rows = Math.max(rowEnd.length, 1);
  const thick = Math.max(rows * rowH + (rows - 1) * ROW_GAP + 2 * LANE_PAD, titleLength(lane));
  const placed = sorted.map(n => ({
    node: n, flow: pos.get(n.id)!.x,
    cross: LANE_PAD + rowOf.get(n.id)! * (rowH + ROW_GAP) + (rowH - size(n).h) / 2,
  }));
  return { lane, thick, placed };
}

/** Approx. px width of bold 12px title text (+margin): the title runs along the lane's thickness. */
const TITLE_CHAR_PX = 7.5;
const TITLE_MARGIN = 30;

function titleLength(lane: DiagramNode): number {
  const text = (lane.label ?? '').replace(/&[#\w]+;/g, ' ').replace(/<[^>]*>/g, '').trim();
  return text.length === 0 ? 0 : Math.ceil(text.length * TITLE_CHAR_PX + TITLE_MARGIN);
}

/** Turn lane plans into the ELK tree with real (un-transposed) coordinates. */
function assemble(plans: LanePlan[], unattached: DiagramNode[], vertical: boolean, size: Size): ElkNode {
  const all = plans.flatMap(p => p.placed);
  const minFlow = Math.min(0, ...all.map(p => p.flow));
  const maxFlow = Math.max(0, ...all.map(p => p.flow + size(p.node).w));
  const header = Math.max(0, ...plans.map(p => headerThickness(p.lane.style)));
  const length = header + FLOW_PAD * 2 + (maxFlow - minFlow);
  const root: ElkNode = { id: 'root', x: 0, y: 0, width: 0, height: 0, children: [], edges: [] };
  let cross = MARGIN;
  for (const plan of plans) {
    const to = (flow: number, c: number) => (vertical ? { x: c, y: flow } : { x: flow, y: c });
    const laneNode: ElkNode = {
      id: plan.lane.id, ...to(MARGIN, cross), width: vertical ? plan.thick : length,
      height: vertical ? length : plan.thick, children: [], edges: [],
    };
    for (const p of plan.placed) {
      const rel = to(header + FLOW_PAD + (p.flow - minFlow), p.cross);
      const attached = p.node.parentId === plan.lane.id;
      const at = attached ? rel : { x: laneNode.x! + rel.x, y: laneNode.y! + rel.y };
      (attached ? laneNode.children! : root.children!).push({ id: p.node.id, ...at, width: p.node.width, height: p.node.height });
    }
    root.children!.push(laneNode);
    cross += plan.thick;
  }
  placeUnattached(root, unattached, vertical, cross + UNATTACHED_GAP);
  return root;
}

/** Nodes with no lane (stray labels) go in a strip after the last lane. */
function placeUnattached(root: ElkNode, nodes: DiagramNode[], vertical: boolean, cross: number): void {
  let flow = MARGIN;
  for (const n of nodes) {
    const at = vertical ? { x: cross, y: flow } : { x: flow, y: cross };
    root.children!.push({ id: n.id, ...at, width: n.width, height: n.height });
    flow += (vertical ? n.height : n.width) + 20;
  }
}
