/**
 * SA4E-406 — orthogonal grid router + port assignment.
 */
import { describe, it, expect } from 'vitest';
import { GridRouter } from '../drawio-grid-router';
import { assignPorts, facingSides } from '../drawio-edge-ports';
import type { DiagramEdge, DiagramNode } from '../drawio-parser';
import type { Rect } from '../drawio-geometry';

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

function orthogonal(pts: Array<{ x: number; y: number }>): boolean {
  return pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y);
}

describe('GridRouter', () => {
  it('routes straight when the way is clear', () => {
    const start = { x: 120, y: 50 }, end = { x: 300, y: 50 };
    const route = new GridRouter([], [start, end]).route({ start, end, startDir: 0, endDir: 2 });
    expect(route).toEqual([start, end]);
  });

  it('detours around an obstacle with orthogonal segments only', () => {
    const obstacle = R(180, 20, 40, 60);
    const start = { x: 120, y: 50 }, end = { x: 300, y: 50 };
    const route = new GridRouter([obstacle], [start, end]).route({ start, end, startDir: 0, endDir: 2 })!;
    expect(route.length).toBeGreaterThan(2);
    expect(orthogonal(route)).toBe(true);
    // no segment passes through the obstacle interior
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      const hitsX = Math.max(a.x, b.x) > obstacle.x && Math.min(a.x, b.x) < obstacle.x + obstacle.w;
      const hitsY = Math.max(a.y, b.y) > obstacle.y && Math.min(a.y, b.y) < obstacle.y + obstacle.h;
      expect(hitsX && hitsY).toBe(false);
    }
  });

  it('puts a second parallel edge on a different lane than the first', () => {
    const a = { x: 100, y: 100 }, b = { x: 400, y: 100 };
    const router = new GridRouter([R(60, 160, 40, 40), R(400, 160, 40, 40)], [a, b]);
    const first = router.route({ start: a, end: b, startDir: 0, endDir: 2 })!;
    const second = router.route({ start: a, end: b, startDir: 0, endDir: 2 })!;
    expect(first).toEqual([a, b]);
    expect(second).not.toEqual(first);
  });

  it('stays out of an unrelated container when a corridor around it exists', () => {
    // Container in the middle (x 150-250, y 0-100) with a node inside; corridor along y=140.
    const inner = R(170, 30, 60, 40);
    const zone = { id: 'box', rect: R(150, 0, 100, 100) };
    const start = { x: 100, y: 50 }, end = { x: 300, y: 50 };
    const anchors = [start, end, { x: 100, y: 140 }, { x: 300, y: 140 }];
    const through = (route: Array<{ x: number; y: number }>): boolean => route.some((p, i) => i > 0
      && Math.min(p.x, route[i - 1].x) < 250 && Math.max(p.x, route[i - 1].x) > 150
      && Math.min(p.y, route[i - 1].y) < 100 && Math.max(p.y, route[i - 1].y) > 0);
    const unrelated = new GridRouter([inner], anchors, [zone]).route({ start, end, startDir: 0, endDir: 2 })!;
    expect(through(unrelated)).toBe(false);
    // the same box is free to cross when the edge belongs to it
    const related = new GridRouter([], anchors, [zone]).route({ start, end, startDir: 0, endDir: 2, related: new Set(['box']) })!;
    expect(related).toEqual([start, end]);
  });

  it('does not run along a container border, even one the edge belongs to', () => {
    // Two stacked lanes share the border y=100; the straight line 1.5 px off it would merge with the separator.
    const lanes = [{ id: 'top', rect: R(0, 0, 400, 100) }, { id: 'bottom', rect: R(0, 100, 400, 100) }];
    const start = { x: 50, y: 101.5 }, end = { x: 350, y: 101.5 };
    const anchors = [start, end, { x: 150, y: 140 }, { x: 250, y: 140 }];
    const route = new GridRouter([], anchors, lanes)
      .route({ start, end, startDir: 0, endDir: 2, related: new Set(['top', 'bottom']) })!;
    // Without the rule the straight line on the border is cheapest (no bends).
    const onBorderLength = route.reduce((sum, p, i) => (i > 0 && p.y === route[i - 1].y && Math.abs(p.y - 100) <= 6
      ? sum + Math.abs(p.x - route[i - 1].x) : sum), 0);
    expect(onBorderLength).toBeLessThan(300);
  });

  it('returns null for anchors that are not on the grid', () => {
    const router = new GridRouter([], [{ x: 0, y: 0 }]);
    expect(router.route({ start: { x: 0, y: 0 }, end: { x: 5, y: 5 }, startDir: 0, endDir: 2 })).toBeNull();
  });
});

describe('port assignment', () => {
  it('picks facing sides by the larger clear gap', () => {
    expect(facingSides(R(0, 0, 100, 50), R(200, 0, 100, 50))).toEqual([0, 2]);
    expect(facingSides(R(0, 0, 100, 50), R(0, 200, 100, 50))).toEqual([1, 3]);
    expect(facingSides(R(300, 200, 100, 50), R(0, 0, 100, 50))).toEqual([2, 0]);
    expect(facingSides(R(200, 200, 100, 50), R(0, 0, 100, 50))).toEqual([3, 1]);
  });

  const cell = (id: string, style = ''): DiagramNode =>
    ({ id, parentId: '1', x: 0, y: 0, width: 0, height: 0, style, isContainer: false });
  const edge = (id: string, s: string, t: string): DiagramEdge => ({
    id, sourceId: s, targetId: t, style: '', parentId: '1', points: [],
    exit: null, entry: null, sourcePoint: null, targetPoint: null,
  });

  it('fans a diamond’s three outputs to up / right / down in target order', () => {
    const rects = new Map<string, Rect>([
      ['d', R(100, 100, 100, 80)], ['in', R(-100, 110, 120, 60)],
      ['t1', R(300, 40, 100, 50)], ['t2', R(300, 125, 100, 50)], ['t3', R(300, 260, 100, 50)],
    ]);
    const cells = new Map<string, DiagramNode>(['d', 'in', 't1', 't2', 't3'].map(i => [i, cell(i, i === 'd' ? 'rhombus;' : '')]));
    const ports = assignPorts([edge('e0', 'in', 'd'), edge('e1', 'd', 't1'), edge('e2', 'd', 't2'), edge('e3', 'd', 't3')], cells, rects);
    expect(ports.get('e0')!.entry.side).toBe(2);
    expect(ports.get('e1')!.exit.side).toBe(3);
    expect(ports.get('e2')!.exit.side).toBe(0);
    expect(ports.get('e3')!.exit.side).toBe(1);
  });

  it('spreads several ends on one side of a rectangle evenly', () => {
    const rects = new Map<string, Rect>([
      ['a', R(0, 100, 100, 100)], ['b', R(300, 0, 50, 50)], ['c', R(300, 120, 50, 50)], ['d', R(300, 240, 50, 50)],
    ]);
    const cells = new Map<string, DiagramNode>(['a', 'b', 'c', 'd'].map(i => [i, cell(i)]));
    const ports = assignPorts([edge('1', 'a', 'b'), edge('2', 'a', 'c'), edge('3', 'a', 'd')], cells, rects);
    expect([ports.get('1')!.exit.frac, ports.get('2')!.exit.frac, ports.get('3')!.exit.frac]).toEqual([0.25, 0.5, 0.75]);
  });
});
