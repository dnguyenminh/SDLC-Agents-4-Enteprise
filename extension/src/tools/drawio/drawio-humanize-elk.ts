/**
 * SA4E-406 — flat ELK run shared by the humanize strategies.
 * Positions a set of boxes (no hierarchy) given their connecting edges.
 */

import type { ElkNode } from './drawio-layout-models';
import { mapAlgorithm, runElkLayout } from './elk-layout';

/** Target width:height of a wrapped flow. */
const WRAP_ASPECT = 1.6;

export interface FlatItem { id: string; width: number; height: number; }
export type Pair = [string, string];

export interface FlatOptions {
  /** ELK direction: DOWN | RIGHT | LEFT | UP. */
  dir: string;
  algorithm: string;
  /** Gap between nodes of the same layer. */
  nodeSpacing: number;
  /** Gap between consecutive layers. */
  layerSpacing: number;
  timeoutMs: number;
  /** Wrap a long flow into several rows/columns around a landscape aspect ratio. */
  wrap?: boolean;
}

/**
 * Remove the edges that close a cycle, found by a depth-first walk that
 * follows edges in declaration order from the sources. Left to itself ELK
 * breaks a cycle by whichever edge its heuristic prefers, which can put a
 * loop's later step before its earlier one; the author's order is the intent.
 */
export function dropBackEdges(ids: string[], pairs: Pair[]): Pair[] {
  const next = new Map<string, string[]>(ids.map(i => [i, []]));
  const indegree = new Map<string, number>(ids.map(i => [i, 0]));
  for (const [s, t] of pairs) {
    next.get(s)!.push(t);
    indegree.set(t, indegree.get(t)! + 1);
  }
  const state = new Map<string, 'open' | 'done'>();
  const back = new Set<string>();
  const visit = (u: string): void => {
    state.set(u, 'open');
    for (const v of next.get(u)!) {
      if (state.get(v) === 'open') back.add(`${u}>${v}`);
      else if (!state.has(v)) visit(v);
    }
    state.set(u, 'done');
  };
  for (const r of [...ids.filter(i => indegree.get(i) === 0), ...ids]) if (!state.has(r)) visit(r);
  return pairs.filter(([s, t]) => !back.has(`${s}>${t}`));
}

/** Top-left position of every item after a layered run over `items` + `pairs`. */
export async function flatPositions(
  items: FlatItem[], pairs: Pair[], o: FlatOptions,
): Promise<Map<string, { x: number; y: number }>> {
  const out = new Map<string, { x: number; y: number }>();
  if (items.length === 0) return out;
  const ids = new Set(items.map(i => i.id));
  const known = pairs.filter(([s, t]) => s !== t && ids.has(s) && ids.has(t));
  // Feedback edges are drawn later by the router; layering sees the forward flow only
  const usable = dropBackEdges([...ids], known);
  const flat: ElkNode = {
    id: '__flat__', width: 0, height: 0,
    children: items.map(i => ({ id: i.id, width: i.width, height: i.height })),
    edges: usable.map(([s, t], i) => ({ id: `__e${i}`, sources: [s], targets: [t] })),
    layoutOptions: {
      'elk.algorithm': mapAlgorithm(o.algorithm),
      'elk.direction': o.dir,
      'elk.spacing.nodeNode': o.nodeSpacing,
      // Nodes with no edge between them are separate components, spaced by this option (default 20 px, too tight for routing)
      'elk.spacing.componentComponent': o.nodeSpacing,
      'elk.layered.spacing.nodeNodeBetweenLayers': o.layerSpacing,
      'elk.edgeRouting': 'ORTHOGONAL',
      // Keep the author's declaration order when the graph leaves a choice
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
  };
  if (o.wrap) {
    flat.layoutOptions!['elk.layered.wrapping.strategy'] = 'MULTI_EDGE';
    flat.layoutOptions!['elk.aspectRatio'] = WRAP_ASPECT;
  }
  const laid = await runElkLayout(flat, o.timeoutMs);
  for (const c of laid.children ?? []) out.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
  return out;
}
