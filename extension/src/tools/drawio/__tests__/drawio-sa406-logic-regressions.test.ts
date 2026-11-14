/**
 * SA4E-406 — logic regressions for the extension-local draw.io auto-layout.
 *
 * These tests cover the root causes behind the remaining corpus defects:
 * segment-accurate edge conflicts, self-loop reservation, flush text rows,
 * and use-case relations owned by their lowest common container.
 */
import { describe, expect, it } from 'vitest';
import { GridRouter, type Dir } from '../drawio-grid-router';
import { RouteLedger } from '../drawio-route-ledger';
import { planEdges } from '../drawio-edge-plan';
import { segsCross } from '../drawio-geometry';
import { snapDiagramToGrid } from '../drawio-grid-snap';
import { parseDrawioXml } from '../drawio-parser';
import { detectUseCaseDiagram } from '../drawio-detect-usecase';
import { planUseCase } from '../drawio-usecase-plan';
import { applyUseCasePlan } from '../drawio-usecase-xml';

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const node = (id: string, parent: string, x: number, y: number, style: string, w = 120, h = 60): string =>
  `<mxCell id="${id}" value="${id}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
const edge = (id: string, source: string, target: string, parent = '1'): string =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="${parent}" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

function routesCross(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): boolean {
  for (let i = 1; i < a.length; i++) {
    for (let k = 1; k < b.length; k++) if (segsCross(a[i - 1], a[i], b[k - 1], b[k])) return true;
  }
  return false;
}

describe('SA4E-406 router segment ledger', () => {
  it('keeps a straight route interior as a conflict after merging grid intervals', () => {
    const ledger = new RouteLedger();
    ledger.addPolyline([
      { x: 300, y: 100 }, { x: 250, y: 100 }, { x: 200, y: 100 }, { x: 100, y: 100 },
    ]);
    expect(ledger.conflicts({ x: 200, y: 200 }, { x: 200, y: 50 }).crossings).toBe(1);
    expect(ledger.conflicts({ x: 300, y: 100 }, { x: 300, y: 75 }, true).crossings).toBe(1);
  });

  it('treats a committed internal corner as a touch instead of a shared endpoint', () => {
    const ledger = new RouteLedger();
    ledger.addPolyline([
      { x: 0, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 300 },
    ]);
    expect(ledger.conflicts({ x: 200, y: 0 }, { x: 200, y: 100 }).touches).toBe(1);
    expect(ledger.conflicts({ x: 200, y: 0 }, { x: 200, y: 50 }).touches).toBe(0);
  });

  it('routes around a committed route when a free corridor exists', () => {
    const a = { x: 300, y: 100 }, b = { x: 100, y: 100 };
    const c = { x: 200, y: 200 }, d = { x: 200, y: 50 };
    const corridor = { x: 310, y: 150 };
    const router = new GridRouter([], [a, b, c, d, corridor]);
    const first = router.route({ start: a, end: b, startDir: 2 as Dir, endDir: 0 as Dir })!;
    const second = router.route({ start: c, end: d, startDir: 3 as Dir, endDir: 1 as Dir })!;
    expect(routesCross(first, second)).toBe(false);
  });
});

describe('SA4E-406 self-loop reservation', () => {
  it('routes a normal edge around the reserved self-loop', () => {
    const graph = parseDrawioXml(wrap(
      node('a', '1', 100, 100, 'rounded=1;', 100, 100)
      + node('b', '1', 300, 100, 'rounded=1;', 100, 100)
      + edge('self', 'a', 'a') + edge('out', 'a', 'b'),
    ));
    const plans = planEdges(graph);
    const loop = plans.find(p => p.id === 'self')!;
    const normal = plans.find(p => p.id === 'out')!;
    expect(routesCross(loop.polyline, normal.polyline)).toBe(false);
  });
});

describe('SA4E-406 text-row stack', () => {
  it('stacks text rows flush on the 10px grid', () => {
    const xml = wrap(
      node('table', '1', 100, 100, 'swimlane;startSize=30;', 400, 200)
      + node('row1', 'table', 20, 30, 'text;html=1;', 360, 25)
      + node('row2', 'table', 20, 50, 'text;html=1;', 360, 25),
    );
    const out = snapDiagramToGrid(xml);
    const graph = parseDrawioXml(out);
    const row1 = graph.nodes.find(n => n.id === 'row1')!;
    const row2 = graph.nodes.find(n => n.id === 'row2')!;
    expect(row1.height % 10).toBe(0);
    expect(row2.y).toBe(row1.y + row1.height);
    expect(row2.y % 10).toBe(0);
  });
});

describe('SA4E-406 use-case relation ownership', () => {
  it('parents an internal relation to the lowest common container', () => {
    const xml = wrap(
      node('actor', '1', 20, 200, 'shape=umlActor;html=1;', 40, 80)
      + node('boundary', '1', 300, 20, 'swimlane;startSize=30;html=1;', 300, 500)
      + node('uc1', 'boundary', 60, 40, 'ellipse;html=1;', 160, 60)
      + node('uc2', 'boundary', 60, 140, 'ellipse;html=1;', 160, 60)
      + node('uc3', 'boundary', 60, 240, 'ellipse;html=1;', 160, 60)
      + edge('a1', 'actor', 'uc1') + edge('a2', 'actor', 'uc2') + edge('a3', 'actor', 'uc3')
      + edge('rel', 'uc2', 'uc3'),
    );
    const graph = parseDrawioXml(xml);
    const model = detectUseCaseDiagram(graph)!;
    const ends = new Map(graph.edges.map(e => [e.id, { source: e.sourceId, target: e.targetId }]));
    const out = applyUseCasePlan(xml, planUseCase(model, graph.edges), model.cases.map(c => c.id), ends);
    expect(parseDrawioXml(out).edges.find(e => e.id === 'rel')?.parentId).toBe('boundary');
  });
});
