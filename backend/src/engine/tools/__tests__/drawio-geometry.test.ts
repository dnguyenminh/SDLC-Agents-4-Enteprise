/**
 * Unit tests for drawio-geometry — absolute rects, rect math, segment tests,
 * perimeter points and edge polyline reconstruction.
 */

import { describe, it, expect } from 'vitest';
import { absoluteRects, ancestorsOf, overlapRatio, rectGap, segIntersectsRect, segsCross, perimeterTowards, firstCrossPoint, segIntersectionPoint } from '../drawio-geometry.js';
import { edgePolyline } from '../drawio-polyline.js';
import type { DiagramGraph } from '../drawio-parser.js';

const node = (id: string, parentId: string, x: number, y: number, w = 120, h = 60) =>
  ({ id, parentId, x, y, width: w, height: h, style: '', isContainer: false });

const NESTED: DiagramGraph = {
  nodes: [
    node('inner', 'cont', 20, 30),
    node('other', '1', 500, 500),
  ],
  edges: [],
  containers: [node('cont', '1', 100, 200, 400, 300, ) as never],
};

describe('absoluteRects', () => {
  it('accumulates parent-chain offsets', () => {
    const rects = absoluteRects(NESTED);
    expect(rects.get('cont')).toEqual({ x: 100, y: 200, w: 400, h: 300 });
    expect(rects.get('inner')).toEqual({ x: 120, y: 230, w: 120, h: 60 });
    expect(rects.get('other')).toEqual({ x: 500, y: 500, w: 120, h: 60 });
  });

  it('ancestorsOf walks the parent chain', () => {
    const byId = new Map([...NESTED.nodes, ...NESTED.containers].map(n => [n.id, n]));
    expect(ancestorsOf('inner', byId)).toEqual(new Set(['cont']));
    expect(ancestorsOf('other', byId)).toEqual(new Set());
  });
});

describe('rect math', () => {
  it('overlapRatio normalizes by the smaller rect', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 50, y: 0, w: 100, h: 100 };
    expect(overlapRatio(a, b)).toBeCloseTo(0.5);
    expect(overlapRatio(a, { x: 200, y: 200, w: 10, h: 10 })).toBe(0);
  });

  it('rectGap returns positive separation or negative overlap', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    expect(rectGap(a, { x: 140, y: 0, w: 10, h: 10 })).toBe(40);
    expect(rectGap(a, { x: 140, y: 500, w: 10, h: 10 })).toBe(400);
    expect(rectGap(a, { x: 50, y: 50, w: 10, h: 10 })).toBeLessThan(0);
  });
});

describe('segIntersectsRect', () => {
  const r = { x: 100, y: 100, w: 50, h: 50 };
  it('detects a crossing segment', () => {
    expect(segIntersectsRect({ x: 0, y: 125 }, { x: 200, y: 125 }, r, 0)).toBe(true);
  });
  it('counts an endpoint inside the rect as a hit', () => {
    expect(segIntersectsRect({ x: 120, y: 120 }, { x: 300, y: 300 }, r, 0)).toBe(true);
  });
  it('rejects a clear miss', () => {
    expect(segIntersectsRect({ x: 0, y: 0 }, { x: 50, y: 50 }, r, 0)).toBe(false);
  });
  it('applies margin', () => {
    expect(segIntersectsRect({ x: 0, y: 160 }, { x: 200, y: 160 }, r, 0)).toBe(false);
    // y=153 is outside the rect (bottom 150) but inside the 5px margin (155)
    expect(segIntersectsRect({ x: 0, y: 153 }, { x: 200, y: 153 }, r, 0)).toBe(false);
    expect(segIntersectsRect({ x: 0, y: 153 }, { x: 200, y: 153 }, r, 5)).toBe(true);
  });
});

describe('segsCross', () => {
  it('detects a proper X crossing', () => {
    expect(segsCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
  });
  it('ignores parallel disjoint segments', () => {
    expect(segsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });
  it('ignores touching at a shared endpoint', () => {
    expect(segsCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 0 })).toBe(false);
  });
  it('counts collinear overlap as crossing (stacked)', () => {
    expect(segsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 })).toBe(true);
  });
});

describe('perimeterTowards', () => {
  const r = { x: 0, y: 0, w: 100, h: 50 };
  it('exits on the right for a target to the right', () => {
    expect(perimeterTowards(r, { x: 500, y: 25 })).toEqual({ x: 100, y: 25 });
  });
  it('exits through the nearest boundary on the ray', () => {
    // Ray from center (50,25) to (500,500) exits through the bottom edge
    const p = perimeterTowards(r, { x: 500, y: 500 });
    expect(p.y).toBeCloseTo(50);
    expect(p.x).toBeGreaterThan(50);
    expect(p.x).toBeLessThan(100);
  });
});

describe('edgePolyline', () => {
  const graph: DiagramGraph = {
    nodes: [node('a', '1', 0, 0), node('b', '1', 300, 0)],
    edges: [{
      id: 'e', sourceId: 'a', targetId: 'b', style: '', parentId: '1',
      points: [{ x: 150, y: -40 }],
      exit: { x: 1, y: 0.5 },
      entry: null,
      sourcePoint: null,
      targetPoint: null,
    }],
    containers: [],
  };
  const originOf = () => ({ x: 0, y: 0 });

  it('builds [fixed exit, waypoints, floating entry] in absolute space', () => {
    const line = edgePolyline(graph.edges[0], absoluteRects(graph), originOf);
    expect(line[0]).toEqual({ x: 120, y: 30 });          // exit right-middle of a
    expect(line[1]).toEqual({ x: 150, y: -40 });          // waypoint
    // Floating entry faces the last waypoint: b's left edge at y=10
    expect(line[2].x).toBeCloseTo(300);
    expect(line[2].y).toBeCloseTo(10);
  });

  it('honors stored terminal hints (sequence message positions)', () => {
    const hinted: DiagramGraph = {
      ...graph,
      edges: [{
        ...graph.edges[0],
        points: [],
        exit: null,
        sourcePoint: { x: 130, y: 120 },
        targetPoint: { x: 340, y: 120 },
      }],
    };
    const line = edgePolyline(hinted.edges[0], absoluteRects(hinted), originOf);
    expect(line[0]).toEqual({ x: 130, y: 120 }); // stored attachment position
    expect(line[1]).toEqual({ x: 340, y: 120 });
  });

  it('maps waypoints through the parent origin for container-owned edges', () => {
    const rects = absoluteRects(graph);
    const line = edgePolyline(graph.edges[0], rects, () => ({ x: 1000, y: 2000 }));
    expect(line[1]).toEqual({ x: 1150, y: 1960 });
  });
});
