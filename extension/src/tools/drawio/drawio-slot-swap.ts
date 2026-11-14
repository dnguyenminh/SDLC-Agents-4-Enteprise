/**
 * SA4E-406 — slot swap optimisation after a relayout. Siblings of (nearly) the
 * same size inside one container are interchangeable grid slots: exchanging two
 * of them keeps the grid intact but can shorten an edge enough to take its label
 * off a layer title or out of a crossing. A swap is kept only when it lowers the
 * number of blocking (high/medium) issues — never on cosmetics alone, so flow
 * order inside a lane or band is not reshuffled for nothing.
 */

import type { DiagramGraph, DiagramNode } from './drawio-parser';
import { parseDrawioXml } from './drawio-parser';
import { DEFAULT_DETECT_THRESHOLDS, detectAllIssues, type DetectThresholds } from './drawio-detect';
import { applyEdgePlans, planEdges } from './drawio-edge-plan';
import { replaceCellGeometryXy, replaceCellSize } from './drawio-xml-utils';
import { absoluteRects } from './drawio-geometry';
import { polylineCache } from './drawio-detect-edge-utils';
import { placeLabels } from './drawio-label-place';

/** Max relative size difference (each axis) for two cells to share a slot. */
const SIZE_TOL = 0.1;
/** Candidate pairs tried PER CONTAINER — bounds the cost (each try = route + detect)
 * without starving later containers: a single global cap left deep levels (L4+)
 * permanently unoptimized (SA4E-406). */
const MAX_PAIRS = 40;
/** Improvement rounds; one swap can enable another. */
const MAX_ROUNDS = 3;
/** Cost weights: ten medium issues cost as much as one high — both are blocking,
 * but high fixes dominate borderline trades (1000 vs 100, NOT 1:∞). */
const WEIGHT = { high: 1000, medium: 100 } as const;

/**
 * Greedily swap interchangeable siblings while the blocking-issue cost drops.
 * @param xml Laid-out diagram XML with planned edges
 * @returns The improved XML (edges re-planned), or the input when nothing helps
 */
export function optimizeSlots(
  xml: string, thresholds: DetectThresholds = DEFAULT_DETECT_THRESHOLDS,
): string {
  let best = xml, bestCost = layoutCost(parseDrawioXml(xml), thresholds);
  for (let round = 0; round < MAX_ROUNDS && bestCost > 0; round++) {
    const pick = bestSwap(best, thresholds);
    if (!pick || pick.cost >= bestCost) break;
    best = pick.xml;
    bestCost = pick.cost;
  }
  return best;
}

/**
 * Try every candidate swap, return the one with the lowest blocking cost;
 * ties go to the shorter total edge length (the tidier arrangement). Strict
 * comparisons keep the incumbent on full ties, so the result is deterministic
 * (candidate order is fixed) — required for byte-identical reruns.
 */
function bestSwap(xml: string, thresholds: DetectThresholds): { xml: string; cost: number } | null {
  let pick: { xml: string; cost: number; length: number } | null = null;
  for (const [a, b] of swapCandidates(parseDrawioXml(xml))) {
    const candidate = reroute(swapPositions(xml, a, b));
    const graph = parseDrawioXml(candidate);
    const cost = layoutCost(graph, thresholds);
    if (pick && cost > pick.cost) continue;
    const length = totalEdgeLength(graph);
    if (!pick || cost < pick.cost || (cost === pick.cost && length < pick.length)) pick = { xml: candidate, cost, length };
  }
  return pick;
}

/** Sum of polyline lengths of all edges (absolute px). */
function totalEdgeLength(graph: DiagramGraph): number {
  let sum = 0;
  for (const line of polylineCache(graph, absoluteRects(graph)).values()) {
    for (let i = 1; i < line.length; i++) sum += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
  }
  return sum;
}

/** Weighted count of blocking issues (low severity is cosmetic and ignored). */
export function layoutCost(
  graph: DiagramGraph, thresholds: DetectThresholds = DEFAULT_DETECT_THRESHOLDS,
): number {
  return detectAllIssues(graph, thresholds).reduce((sum, i) => sum + (i.severity === 'low' ? 0 : WEIGHT[i.severity]), 0);
}

/**
 * Pairs of leaf siblings with matching size where at least one carries an edge
 * (moving two unconnected boxes cannot change any issue). Siblings ordered by
 * flow are never candidates: a directed edge or directed path between them
 * would run BACKWARDS after the swap (SA4E-406: a→b→c + c→a inverted a→b).
 * The candidate budget is per container, so deep levels still get optimized.
 */
export function swapCandidates(graph: DiagramGraph): Array<[DiagramNode, DiagramNode]> {
  const linked = new Set(graph.edges.flatMap(e => [e.sourceId, e.targetId]));
  const byParent = new Map<string, DiagramNode[]>();
  for (const n of graph.nodes) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n]);
  const pairs: Array<[DiagramNode, DiagramNode]> = [];
  for (const kids of byParent.values()) pairs.push(...candidatesIn(kids, graph, linked));
  return pairs;
}

/** Candidate pairs within ONE parent group, budgeted to MAX_PAIRS. */
function candidatesIn(kids: DiagramNode[], graph: DiagramGraph, linked: Set<string>): Array<[DiagramNode, DiagramNode]> {
  const reach = flowReach(kids, graph);
  const out: Array<[DiagramNode, DiagramNode]> = [];
  for (let i = 0; i < kids.length; i++) {
    for (let j = i + 1; j < kids.length; j++) {
      const [a, b] = [kids[i], kids[j]];
      if (!sameSize(a, b) || !(linked.has(a.id) || linked.has(b.id))) continue;
      if (reach.get(a.id)!.has(b.id) || reach.get(b.id)!.has(a.id)) continue;
      out.push([a, b]);
    }
  }
  return out.slice(0, MAX_PAIRS);
}

/** Sibling id → ids reachable from it over directed edges INSIDE the group (self included). */
function flowReach(kids: DiagramNode[], graph: DiagramGraph): Map<string, Set<string>> {
  const ids = new Set(kids.map(k => k.id));
  const next = new Map<string, string[]>(kids.map(k => [k.id, [] as string[]]));
  for (const e of graph.edges) {
    if (ids.has(e.sourceId) && ids.has(e.targetId)) next.get(e.sourceId)!.push(e.targetId);
  }
  const reach = new Map<string, Set<string>>();
  for (const k of kids) reach.set(k.id, reachableFrom(k.id, next));
  return reach;
}

/** BFS over the `next` adjacency from `start` (start included). */
function reachableFrom(start: string, next: Map<string, string[]>): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const t of next.get(cur) ?? []) if (!seen.has(t)) { seen.add(t); queue.push(t); }
  }
  return seen;
}

function sameSize(a: DiagramNode, b: DiagramNode): boolean {
  const close = (p: number, q: number) => Math.abs(p - q) <= SIZE_TOL * Math.max(p, q, 1);
  return close(a.width, b.width) && close(a.height, b.height);
}

/** Exchange the FULL slot rectangles (position and size) of two siblings: with
 * sizes allowed to differ by SIZE_TOL, a top-left-only swap leaves the grid
 * misaligned — exchanging whole slots keeps it pixel-perfect. */
function swapPositions(xml: string, a: DiagramNode, b: DiagramNode): string {
  let out = replaceCellGeometryXy(replaceCellGeometryXy(xml, a.id, b.x, b.y), b.id, a.x, a.y);
  out = replaceCellSize(replaceCellSize(out, a.id, b.width, b.height), b.id, a.width, a.height);
  return out;
}

/** Re-plan every edge on the new geometry, then slide labels clear of boxes/titles. */
function reroute(xml: string): string {
  return placeLabels(applyEdgePlans(xml, planEdges(parseDrawioXml(xml))));
}
