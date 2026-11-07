/**
 * SA4E-410 (DISC-3) — Regression tests for drawio-flatten.
 *
 * The draw.io CLI aborts with "Export failed" on physically nested <mxCell>
 * elements. flattenNestedCells hoists them to root level while keeping the
 * logical parent and relative geometry (NO coordinate arithmetic).
 */

import { describe, it, expect } from 'vitest';
import { flattenNestedCells, escapeAttr } from '../drawio-flatten.js';

const NESTED = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="t">
<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="lane" value="Host" style="swimlane;" vertex="1" parent="1">
  <mxGeometry x="20" y="20" width="400" height="300" as="geometry"/>
  <mxCell id="child" value="Class" style="rounded=1;" vertex="1" parent="lane">
    <mxGeometry x="10" y="40" width="120" height="60" as="geometry"/>
  </mxCell>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;

const FLAT = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="t">
<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;

describe('flattenNestedCells', () => {
  it('returns flat documents unchanged', () => {
    expect(flattenNestedCells(FLAT)).toBe(FLAT);
  });

  it('hoists a physically nested cell to root level', () => {
    const out = flattenNestedCells(NESTED);
    // child no longer sits inside the lane element
    const laneEnd = out.indexOf('</mxCell>');
    const childOpen = out.indexOf('<mxCell id="child"');
    expect(childOpen).toBeGreaterThan(-1);
    expect(childOpen).toBeGreaterThan(laneEnd);
  });

  it('keeps the logical parent and relative geometry (no coordinate math)', () => {
    const out = flattenNestedCells(NESTED);
    const child = /<mxCell id="child"[^>]*("[^>]*>)/.exec(out)?.[0] ?? '';
    expect(child).toContain('parent="lane"');
    expect(out).toContain('<mxGeometry x="10" y="40" width="120" height="60" as="geometry"/>');
    // parent lane geometry must stay untouched
    expect(out).toContain('<mxGeometry x="20" y="20" width="400" height="300" as="geometry"/>');
  });

  it('does not convert child coordinates to absolute space', () => {
    const out = flattenNestedCells(NESTED);
    // x=10 stays 10; ancestor offset (20+20+…) must never be summed in
    expect(out).not.toContain('x="30" y="60"');
    expect(out).not.toContain('x="50" y="60"');
  });

  it('keeps root cells 0/1 geometry-free first', () => {
    const out = flattenNestedCells(NESTED);
    const first = out.indexOf('<mxCell id="0"');
    const second = out.indexOf('<mxCell id="1"');
    const third = out.indexOf('<mxCell id="lane"');
    expect(first).toBeLessThan(second);
    expect(second).toBeLessThan(third);
  });

  it('hoists an edge declared inside a container cell, keeping waypoints', () => {
    const nestedEdge = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="t">
<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="a" value="A" vertex="1" parent="1">
  <mxGeometry x="20" y="20" width="100" height="50" as="geometry"/>
  <mxCell id="e" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="a" source="a" target="b">
    <mxGeometry relative="1" as="geometry">
      <Array as="points"><mxPoint x="200" y="100"/></Array>
    </mxGeometry>
  </mxCell>
</mxCell>
<mxCell id="b" value="B" vertex="1" parent="1">
  <mxGeometry x="300" y="20" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const out = flattenNestedCells(nestedEdge);
    const aClose = out.indexOf('</mxCell>');
    const edgeOpen = out.indexOf('<mxCell id="e"');
    expect(edgeOpen).toBeGreaterThan(aClose);
    expect(out).toContain('parent="a"');
    expect(out).toContain('<mxPoint x="200" y="100"/>');
  });
  it('handles quoted attribute values containing raw < > when hoisting (DISC-3b)', () => {
    const rawAngle = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="t">
<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="lane" value="A & B" vertex="1" parent="1">
  <mxGeometry x="20" y="20" width="400" height="300" as="geometry"/>
  <mxCell id="inner" value="Map<string, X>" vertex="1" parent="lane">
    <mxGeometry x="10" y="40" width="100" height="50" as="geometry"/>
  </mxCell>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const out = flattenNestedCells(rawAngle);
    const laneClose = out.indexOf('</mxCell>');
    const innerOpen = out.indexOf('<mxCell id="inner"');
    expect(innerOpen).toBeGreaterThan(laneClose);
    // attrs survive the hoist (escaped to well-formed entities)
    expect(out).toContain('value="A &amp; B"');
    expect(out).toContain('value="Map&lt;string, X&gt;"');
    expect(out).toContain('parent="lane"');
    expect(out).toContain('vertex="1"');
    // no attribute debris outside the tags
    expect(out).not.toContain('" vertex="1" parent="lane"">\n    \n');
    expect(out).toContain('<mxGeometry x="10" y="40" width="100" height="50" as="geometry"/>');
  });
});

describe('escapeAttr', () => {
  it('escapes raw XML-significant characters', () => {
    expect(escapeAttr('Map<string, Tab>')).toBe('Map&lt;string, Tab&gt;');
    expect(escapeAttr('A & B')).toBe('A &amp; B');
  });

  it('leaves already-valid entities untouched (idempotent)', () => {
    expect(escapeAttr('Map&lt;string&gt;')).toBe('Map&lt;string&gt;');
    expect(escapeAttr('A &amp; B')).toBe('A &amp; B');
  });
});
