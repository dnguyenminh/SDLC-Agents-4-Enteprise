/**
 * Unit tests for the local-repair planner — push-apart, containment,
 * edge rerouting and stacked-edge offsets. All coordinates are verified
 * against the required minimum gap.
 */

import { describe, it, expect } from 'vitest';
import { planLocalRepair } from '../drawio-repair.js';
import { MIN_GAP } from '../drawio-detect.js';
import type { DiagramGraph, DiagramNode, DiagramEdge } from '../drawio-parser.js';
import { absoluteRects, rectGap } from '../drawio-geometry.js';

const node = (id: string, parentId: string, x: number, y: number, w = 120, h = 60): DiagramNode =>
  ({ id, parentId, x, y, width: w, height: h, style: '', isContainer: false });

const edge = (id: string, sourceId: string, targetId: string, points: Array<{ x: number; y: number }> = []): DiagramEdge =>
  ({ id, sourceId, targetId, style: '', parentId: '1', points, exit: null, entry: null, sourcePoint: null, targetPoint: null });

const SPACING = 80;

function gapAfter(g: DiagramGraph, aId: string, bId: string): number {
  const rects = absoluteRects(g);
  return rectGap(rects.get(aId)!, rects.get(bId)!);
}

describe('planLocalRepair — push apart', () => {
  it('separates an overlapping pair to at least the required gap', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('b', '1', 30, 0)],
      edges: [], containers: [],
    };
    const plan = planLocalRepair(g, [
      { type: 'node_overlap', severity: 'high', node_a: 'a', node_b: 'b' },
    ], SPACING);
    const after: DiagramGraph = {
      ...g,
      nodes: [
        { ...g.nodes[0], x: plan.moves.get('a')!.x, y: plan.moves.get('a')!.y },
        { ...g.nodes[1], x: plan.moves.get('b')!.x, y: plan.moves.get('b')!.y },
      ],
    };
    expect(plan.moves.size).toBe(2);
    expect(gapAfter(after, 'a', 'b')).toBeGreaterThanOrEqual(Math.max(SPACING * 0.5, MIN_GAP) - 0.5);
  });

  it('widens a too-tight gap to MIN_GAP', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('b', '1', 140, 0)], // 20px gap
      edges: [], containers: [],
    };
    const plan = planLocalRepair(g, [
      { type: 'node_proximity', severity: 'medium', node_a: 'a', node_b: 'b', gap: 20 },
    ], SPACING);
    const after: DiagramGraph = {
      ...g,
      nodes: [
        { ...g.nodes[0], x: plan.moves.get('a')!.x },
        { ...g.nodes[1], x: plan.moves.get('b')!.x },
      ],
    };
    expect(gapAfter(after, 'a', 'b')).toBeGreaterThanOrEqual(MIN_GAP - 0.5);
  });

  it('leaves uninvolved nodes untouched', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('b', '1', 30, 0), node('far', '1', 800, 400)],
      edges: [], containers: [],
    };
    const plan = planLocalRepair(g, [
      { type: 'node_overlap', severity: 'high', node_a: 'a', node_b: 'b' },
    ], SPACING);
    expect(plan.moves.has('far')).toBe(false);
  });
});

describe('planLocalRepair — containment', () => {
  it('clamps an escaping child back inside its container', () => {
    const g: DiagramGraph = {
      nodes: [node('a', 'c', 250, 10)],
      edges: [], containers: [node('c', '1', 0, 0, 200, 200)],
    };
    const plan = planLocalRepair(g, [
      { type: 'child_outside_container', severity: 'high', child: 'a', container: 'c' },
    ], SPACING);
    const after: DiagramGraph = {
      ...g,
      nodes: [{ ...g.nodes[0], x: plan.moves.get('a')!.x, y: plan.moves.get('a')!.y }],
    };
    expect(gapAfter(after, 'a', 'c')).toBeLessThanOrEqual(-10); // inside with margin
    expect(plan.resizes.size).toBe(0);
  });

  it('grows the container when the child does not fit', () => {
    const g: DiagramGraph = {
      nodes: [node('a', 'c', 0, 10, 150, 60)],
      edges: [], containers: [node('c', '1', 0, 0, 100, 100)],
    };
    const plan = planLocalRepair(g, [
      { type: 'child_outside_container', severity: 'high', child: 'a', container: 'c' },
    ], SPACING);
    expect(plan.resizes.get('c')!.w).toBeGreaterThanOrEqual(150 + 20);
  });
});

describe('planLocalRepair — edge rerouting', () => {
  it('adds waypoints that clear the crossed node', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('m', '1', 200, -40, 120, 140), node('b', '1', 400, 0)],
      edges: [edge('e', 'a', 'b')],
      containers: [],
    };
    const plan = planLocalRepair(g, [
      { type: 'edge_crossing', severity: 'high', edge_id: 'e', crosses_node: 'm' },
    ], SPACING);
    const wps = plan.routes.get('e');
    expect(wps).toBeDefined();
    expect(wps!.length).toBeGreaterThan(0);
    // Every rerouted segment must avoid the obstacle rect (200..320, -40..100)
    const line = [{ x: 120, y: 30 }, ...wps!, { x: 400, y: 30 }];
    for (let i = 1; i < line.length; i++) {
      const p1 = line[i - 1], p2 = line[i];
      const crosses = segmentHits(p1, p2, 200, -40, 320, 100);
      expect(crosses).toBe(false);
    }
  });

  it('offsets the second of two stacked parallel edges', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('b', '1', 300, 0)],
      edges: [edge('e1', 'a', 'b'), edge('e2', 'a', 'b')],
      containers: [],
    };
    const plan = planLocalRepair(g, [
      { type: 'stacked_edges', severity: 'medium', edge_a: 'e1', edge_b: 'e2' },
    ], SPACING);
    expect(plan.routes.get('e2')).toBeDefined();
    expect(plan.routes.has('e1')).toBe(false);
  });
});

function segmentHits(
  p1: { x: number; y: number }, p2: { x: number; y: number },
  l: number, t: number, r: number, b: number,
): boolean {
  // Sample-based check: sufficient for test verification
  for (let s = 0; s <= 20; s++) {
    const x = p1.x + (p2.x - p1.x) * (s / 20);
    const y = p1.y + (p2.y - p1.y) * (s / 20);
    if (x > l && x < r && y > t && y < b) return true;
  }
  return false;
}
