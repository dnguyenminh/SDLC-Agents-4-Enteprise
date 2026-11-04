/**
 * Unit tests for layout issue detectors — overlaps, proximity, containment,
 * edge-node/edge-edge/edge-container crossings. Fixtures are inline draw.io
 * graphs built directly (no XML parsing needed here).
 */

import { describe, it, expect } from 'vitest';
import { detectAllIssues, detectNodeOverlaps, detectNodeProximity, detectChildOutsideContainer } from '../drawio-detect.js';
import { edgeNodeCrossings, edgeEdgeCrossings, edgeContainerCrossings } from '../drawio-detect-edges.js';
import { absoluteRects } from '../drawio-geometry.js';
import type { DiagramGraph, DiagramNode, DiagramEdge } from '../drawio-parser.js';

const node = (id: string, parentId: string, x: number, y: number, w = 120, h = 60): DiagramNode =>
  ({ id, parentId, x, y, width: w, height: h, style: '', isContainer: false });

const edge = (id: string, sourceId: string, targetId: string, points: Array<{ x: number; y: number }> = []): DiagramEdge =>
  ({ id, sourceId, targetId, style: '', parentId: '1', points, exit: null, entry: null, sourcePoint: null, targetPoint: null });

describe('detectNodeOverlaps', () => {
  it('flags sibling overlap above 5% of the smaller node', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('b', '1', 30, 0)],
      edges: [], containers: [],
    };
    const issues = detectNodeOverlaps(g);
    expect(issues.some(i => i.type === 'node_overlap' && i.severity === 'high')).toBe(true);
  });

  it('flags cross-container overlap via absolute coordinates', () => {
    const g: DiagramGraph = {
      nodes: [node('a', 'c1', 0, 0), node('b', 'c2', 10, 10)],
      edges: [], containers: [node('c1', '1', 0, 0, 300, 300), node('c2', '1', 0, 0, 300, 300)],
    };
    expect(detectNodeOverlaps(g).length).toBeGreaterThan(0);
  });

  it('never flags a parent/child pair', () => {
    const g: DiagramGraph = {
      nodes: [node('a', 'c1', 10, 10)],
      edges: [], containers: [node('c1', '1', 0, 0, 300, 300)],
    };
    expect(detectNodeOverlaps(g)).toHaveLength(0);
  });

  it('demotes full containment (background card pattern) to a low hint', () => {
    const g: DiagramGraph = {
      nodes: [node('card', '1', 0, 0, 400, 300), node('item', '1', 40, 40)],
      edges: [], containers: [],
    };
    const issues = detectNodeOverlaps(g);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ type: 'node_containment_hint', severity: 'low' });
  });

  it('skips UML lifelines and fragment frames (sequence constructs overlap by design)', () => {
    const lifeline = node('p1', '1', 100, 0, 40, 400);
    lifeline.style = 'shape=umlLifeline;';
    const frame = node('frag', '1', 80, 80, 300, 160);
    frame.style = 'rounded=0;dashed=1;fillColor=#f5f5f5;';
    const g: DiagramGraph = {
      nodes: [lifeline, frame],
      edges: [], containers: [],
    };
    expect(detectNodeOverlaps(g)).toHaveLength(0);
  });

  it('flags partial overlap of same-size nodes as high', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('b', '1', 100, 0)], // 20px of 120 covered
      edges: [], containers: [],
    };
    const issues = detectNodeOverlaps(g);
    expect(issues[0]).toMatchObject({ type: 'node_overlap', severity: 'high' });
  });
});

describe('detectNodeProximity', () => {
  it('flags siblings closer than MIN_GAP as low-severity warnings', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('b', '1', 140, 0)], // 20px gap
      edges: [], containers: [],
    };
    const issues = detectNodeProximity(g);
    expect(issues.some(i => i.type === 'node_proximity' && i.severity === 'low')).toBe(true);
  });

  it('accepts gaps >= MIN_GAP', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('b', '1', 160, 0)], // 40px gap
      edges: [], containers: [],
    };
    expect(detectNodeProximity(g)).toHaveLength(0);
  });
});

describe('detectChildOutsideContainer', () => {
  it('flags a child escaping its container', () => {
    const g: DiagramGraph = {
      nodes: [node('a', 'c', 250, 10)],
      edges: [], containers: [node('c', '1', 0, 0, 200, 200)],
    };
    const issues = detectChildOutsideContainer(g);
    expect(issues[0]).toMatchObject({ type: 'child_outside_container', child: 'a', container: 'c' });
  });

  it('accepts children inside the container', () => {
    const g: DiagramGraph = {
      nodes: [node('a', 'c', 20, 20)],
      edges: [], containers: [node('c', '1', 0, 0, 200, 200)],
    };
    expect(detectChildOutsideContainer(g)).toHaveLength(0);
  });
});

describe('edgeNodeCrossings', () => {
  it('flags an edge cutting through an unrelated node', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('m', '1', 200, -40, 120, 140), node('b', '1', 400, 0)],
      edges: [edge('e', 'a', 'b')],
      containers: [],
    };
    const issues = edgeNodeCrossings(g, absoluteRects(g));
    expect(issues[0]).toMatchObject({ type: 'edge_crossing', crosses_node: 'm' });
  });

  it('does not flag an edge detoured around the node', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('m', '1', 200, -40, 120, 140), node('b', '1', 400, 0)],
      edges: [edge('e', 'a', 'b', [{ x: 60, y: 130 }, { x: 400, y: 130 }])],
      containers: [],
    };
    expect(edgeNodeCrossings(g, absoluteRects(g))).toHaveLength(0);
  });

  it('does not flag a node that fully contains an endpoint (background card)', () => {
    const g: DiagramGraph = {
      nodes: [
        node('card', '1', 0, 0, 400, 300),
        node('a', '1', 20, 20),
        node('b', '1', 500, 20),
      ],
      edges: [edge('e', 'a', 'b')],
      containers: [],
    };
    // The edge leaves the card — geometrically crosses it, visually legitimate
    expect(edgeNodeCrossings(g, absoluteRects(g))).toHaveLength(0);
  });

  it('does not flag layer bands (nodes fully containing other nodes)', () => {
    // Layered architecture: edge from band 2 to band 4 passes over band 3
    const g: DiagramGraph = {
      nodes: [
        node('layer1', '1', 0, 0, 600, 100),
        node('svc', '1', 20, 120),
        node('layer2', '1', 0, 110, 600, 100),
        node('mgr', '1', 20, 240),
        node('layer3', '1', 0, 220, 600, 100),
        node('store', '1', 20, 360),
        node('layer4', '1', 0, 350, 600, 100),
      ],
      edges: [edge('e', 'mgr', 'store')],
      containers: [],
    };
    expect(edgeNodeCrossings(g, absoluteRects(g))).toHaveLength(0);
  });
});

describe('edgeEdgeCrossings', () => {
  it('flags two crossing edges without shared endpoints', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('b', '1', 300, 200), node('c', '1', 300, 0), node('d', '1', 0, 200)],
      edges: [edge('e1', 'a', 'b'), edge('e2', 'c', 'd')],
      containers: [],
    };
    const issues = edgeEdgeCrossings(g, absoluteRects(g));
    expect(issues.some(i => i.type === 'edge_edge_crossing')).toBe(true);
  });

  it('does not flag edges fanning out from a shared endpoint', () => {
    const g: DiagramGraph = {
      nodes: [node('hub', '1', 0, 100), node('a', '1', 300, 0), node('b', '1', 300, 200)],
      edges: [edge('e1', 'hub', 'a'), edge('e2', 'hub', 'b')],
      containers: [],
    };
    expect(edgeEdgeCrossings(g, absoluteRects(g))).toHaveLength(0);
  });

  it('flags stacked parallel edges between the same pair', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('b', '1', 300, 0)],
      edges: [edge('e1', 'a', 'b'), edge('e2', 'a', 'b')],
      containers: [],
    };
    const issues = edgeEdgeCrossings(g, absoluteRects(g));
    expect(issues.some(i => i.type === 'stacked_edges')).toBe(true);
  });

  it('detects crossings of loose point-only edges (floating sequence messages)', () => {
    const m1 = edge('m1', '', '');
    m1.sourcePoint = { x: 130, y: 120 };
    m1.targetPoint = { x: 340, y: 120 };
    const m2 = edge('m2', '', '');
    m2.sourcePoint = { x: 140, y: 220 };
    m2.targetPoint = { x: 350, y: 20 };
    const g: DiagramGraph = {
      nodes: [node('a', '1', 80, 40, 40, 400), node('b', '1', 320, 40, 40, 400)],
      edges: [],
      containers: [],
    };
    (g as unknown as { looseEdges: DiagramEdge[] }).looseEdges = [m1, m2];
    const issues = edgeEdgeCrossings(g, absoluteRects(g));
    expect(issues.some(i => i.type === 'edge_edge_crossing')).toBe(true);
  });

  it('does not flag request/response on the same pair at different heights', () => {
    // Sequence-diagram pattern: two messages between the same lifelines,
    // rendered at different y via stored terminal hints
    const e1 = edge('m1', 'a', 'b');
    e1.sourcePoint = { x: 130, y: 120 };
    e1.targetPoint = { x: 340, y: 120 };
    const e2 = edge('m6', 'b', 'a');
    e2.sourcePoint = { x: 340, y: 220 };
    e2.targetPoint = { x: 130, y: 220 };
    const g: DiagramGraph = {
      nodes: [node('a', '1', 80, 40, 40, 400), node('b', '1', 320, 40, 40, 400)],
      edges: [e1, e2],
      containers: [],
    };
    expect(edgeEdgeCrossings(g, absoluteRects(g))).toHaveLength(0);
  });
});

describe('edgeContainerCrossings', () => {
  it('flags an edge passing over an unrelated container', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('b', '1', 500, 0)],
      edges: [edge('e', 'a', 'b')],
      containers: [node('c', '1', 220, -30, 120, 120)],
    };
    const issues = edgeContainerCrossings(g, absoluteRects(g));
    expect(issues[0]).toMatchObject({ type: 'edge_container_crossing', crosses_container: 'c' });
  });

  it('never flags the container that owns an endpoint', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('b', 'c', 260, 20)],
      edges: [edge('e', 'a', 'b')],
      containers: [node('c', '1', 200, 0, 300, 200)],
    };
    expect(edgeContainerCrossings(g, absoluteRects(g))).toHaveLength(0);
  });
});

describe('detectAllIssues — integration', () => {
  it('classifies diagonal edges as low-severity warnings', () => {
    const g: DiagramGraph = {
      nodes: [node('a', '1', 0, 0), node('b', '1', 300, 300)],
      edges: [edge('e', 'a', 'b')],
      containers: [],
    };
    const issues = detectAllIssues(g);
    expect(issues.filter(i => i.type === 'diagonal_edge').every(i => i.severity === 'low')).toBe(true);
    expect(issues.filter(i => i.severity !== 'low')).toHaveLength(0);
  });
});
