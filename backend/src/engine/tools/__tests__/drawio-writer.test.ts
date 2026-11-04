/**
 * SA4E-84 — Unit tests for drawio-writer applyLayoutToXml (pure serialization).
 * Covers flat diagrams, compound (nested) diagrams, edge waypoints and ports.
 */

import { describe, it, expect } from 'vitest';
import { applyLayoutToXml } from '../drawio-writer.js';
import type { ElkNode, ElkEdge } from '../drawio-layout-models.js';

const RAW_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n2" value="B" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="240" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="e1" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="n1" target="n2">
  <mxGeometry relative="1" as="geometry"><Array as="points"/></mxGeometry>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;

// Compound: container 'cont' owns nested node 'cn1' and internal edge 'ce1'
const NESTED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="cont" value="Group" style="swimlane;" vertex="1" parent="1">
  <mxGeometry x="10" y="10" width="400" height="300" as="geometry"/>
</mxCell>
<mxCell id="cn1" value="A" style="rounded=1;" vertex="1" parent="cont">
  <mxGeometry x="20" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="cn2" value="B" style="rounded=1;" vertex="1" parent="cont">
  <mxGeometry x="200" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="ce1" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="cont" source="cn1" target="cn2">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;

function laidOutChildren(children: ElkNode[], edges: ElkEdge[] = []): ElkNode {
  const withEdges = children.map((c, i) => i === 0 ? { ...c, edges } : c);
  return { id: 'root', x: 0, y: 0, width: 0, height: 0, children: withEdges };
}

describe('applyLayoutToXml — flat diagrams', () => {
  it('rewrites node geometry to laid-out coordinates', () => {
    const laidOut = laidOutChildren([
      { id: 'n1', x: 400, y: 100, width: 120, height: 60 },
      { id: 'n2', x: 600, y: 100, width: 120, height: 60 },
    ]);
    const { xml } = applyLayoutToXml(RAW_XML, laidOut);
    expect(xml).toContain('<mxGeometry x="400" y="100" width="120" height="60" as="geometry"/>');
    expect(xml).toContain('<mxGeometry x="600" y="100" width="120" height="60" as="geometry"/>');
  });

  it('reports repositioned nodes with old and new coordinates', () => {
    const laidOut = laidOutChildren([
      { id: 'n1', x: 400, y: 100, width: 120, height: 60 },
      { id: 'n2', x: 600, y: 100, width: 120, height: 60 },
    ]);
    const { repositionedNodes } = applyLayoutToXml(RAW_XML, laidOut);
    expect(repositionedNodes).toHaveLength(2);
    const n1 = repositionedNodes.find(r => r.id === 'n1')!;
    expect(n1).toEqual({ id: 'n1', x_old: 40, y_old: 40, x_new: 400, y_new: 100 });
  });

  it('normalizes negative coordinates to positive', () => {
    const laidOut = laidOutChildren([
      { id: 'n1', x: -20, y: -30, width: 120, height: 60 },
      { id: 'n2', x: -20, y: 130, width: 120, height: 60 },
    ]);
    const { xml, repositionedNodes } = applyLayoutToXml(RAW_XML, laidOut);
    expect(xml).toContain('<mxGeometry x="0" y="0"');
    expect(xml).toContain('<mxGeometry x="0" y="160"');
    const n1 = repositionedNodes.find(r => r.id === 'n1')!;
    expect(n1.x_new).toBe(0);
    expect(n1.y_new).toBe(0);
  });

  it('rounds coordinates to one decimal place', () => {
    const laidOut = laidOutChildren([
      { id: 'n1', x: 100.555, y: 0.123, width: 120, height: 60 },
    ]);
    const { xml } = applyLayoutToXml(RAW_XML, laidOut);
    expect(xml).toContain('<mxGeometry x="100.6" y="0.1"');
  });

  it('writes edge bend points into the Array as="points" section', () => {
    const edge: ElkEdge = {
      id: 'e1', sources: ['n1'], targets: ['n2'],
      sections: [{ bendPoints: [{ x: 300, y: 260 }, { x: 350, y: 260 }] }],
    };
    const laidOut = laidOutChildren([
      { id: 'n1', x: 400, y: 100, width: 120, height: 60 },
      { id: 'n2', x: 600, y: 100, width: 120, height: 60 },
    ], [edge]);
    const { xml } = applyLayoutToXml(RAW_XML, laidOut);
    expect(xml).toContain('<Array as="points"><mxPoint x="300" y="260"/><mxPoint x="350" y="260"/></Array>');
    // The stale self-closing empty array must not survive next to the new one
    expect(xml).not.toContain('<Array as="points"/><Array');
  });

  it('writes exit/entry anchors from ELK section endpoints', () => {
    const edge: ElkEdge = {
      id: 'e1', sources: ['n1'], targets: ['n2'],
      sections: [{
        startPoint: { x: 520, y: 130 }, // right edge of n1 (400+120, 100+30)
        bendPoints: [{ x: 560, y: 130 }],
        endPoint: { x: 600, y: 130 },   // left edge of n2
      }],
    };
    const laidOut = laidOutChildren([
      { id: 'n1', x: 400, y: 100, width: 120, height: 60 },
      { id: 'n2', x: 600, y: 100, width: 120, height: 60 },
    ], [edge]);
    const { xml } = applyLayoutToXml(RAW_XML, laidOut);
    expect(xml).toContain('exitX=1;exitY=0.5;');
    expect(xml).toContain('entryX=0;entryY=0.5;');
  });

  it('returns empty repositioned list when positions are unchanged', () => {
    const laidOut = laidOutChildren([
      { id: 'n1', x: 40, y: 40, width: 120, height: 60 },
      { id: 'n2', x: 240, y: 40, width: 120, height: 60 },
    ]);
    const { xml, repositionedNodes } = applyLayoutToXml(RAW_XML, laidOut);
    expect(repositionedNodes).toHaveLength(0);
    expect(xml).toBe(RAW_XML);
  });

  it('skips nodes absent from the source XML', () => {
    const laidOut = laidOutChildren([
      { id: 'n1', x: 400, y: 100, width: 120, height: 60 },
      { id: 'ghost', x: 50, y: 50, width: 120, height: 60 },
    ]);
    const { xml, repositionedNodes } = applyLayoutToXml(RAW_XML, laidOut);
    expect(xml).not.toContain('x="50" y="50"');
    expect(repositionedNodes.some(r => r.id === 'ghost')).toBe(false);
  });

  it('inserts x/y attributes when the geometry lacks them', () => {
    const missing = RAW_XML.replace(
      '<mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>',
      '<mxGeometry width="120" height="60" as="geometry"/>',
    );
    const laidOut = laidOutChildren([
      { id: 'n1', x: 400, y: 100, width: 120, height: 60 },
      { id: 'n2', x: 600, y: 100, width: 120, height: 60 },
    ]);
    const { xml } = applyLayoutToXml(missing, laidOut);
    expect(xml).toContain('x="400" y="100"');
  });
});

describe('applyLayoutToXml — compound (nested) diagrams', () => {
  function nestedElk(): ElkNode {
    return {
      id: 'root', x: 0, y: 0, width: 0, height: 0,
      children: [{
        id: 'cont', x: 100, y: 100, width: 400, height: 300,
        children: [
          { id: 'cn1', x: 20, y: 40, width: 120, height: 60 },
          { id: 'cn2', x: 220, y: 40, width: 120, height: 60 },
        ],
        edges: [{
          id: 'ce1', sources: ['cn1'], targets: ['cn2'],
          sections: [{ bendPoints: [{ x: 170, y: 70 }] }],
        }],
      }],
    };
  }

  it('shifts root-level nodes but never double-shifts nested children', () => {
    const { xml } = applyLayoutToXml(NESTED_XML, nestedElk());
    expect(xml).toContain('<mxGeometry x="100" y="100" width="400" height="300"');
    // Nested coords stay in container space (relative), untouched by the shift
    expect(xml).toContain('<mxGeometry x="20" y="40" width="120" height="60"');
    expect(xml).toContain('<mxGeometry x="220" y="40" width="120" height="60"');
    expect(xml).not.toContain('x="120" y="140"'); // double-shift guard
  });

  it('writes waypoints for container-internal edges in parent space', () => {
    const { xml } = applyLayoutToXml(NESTED_XML, nestedElk());
    expect(xml).toContain('<Array as="points"><mxPoint x="170" y="70"/></Array>');
  });
});
