/**
 * SA4E-84 — Unit tests for drawio-apply orchestration.
 * Covers: guard rails, strategy selection (local repair / ELK / ports-only),
 * and args normalization. Detection itself is covered in drawio-detect tests.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseDrawio } from '../drawio-parser.js';
import { handleApply, normalizeLayoutArgs } from '../drawio-apply.js';

const CONTAINER_OVERLAP = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="cont" value="Service" style="swimlane;" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="600" height="600" as="geometry"/>
</mxCell>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="cont">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n2" value="B" style="rounded=1;" vertex="1" parent="cont">
  <mxGeometry x="50" y="50" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n3" value="C" style="rounded=1;" vertex="1" parent="cont">
  <mxGeometry x="240" y="240" width="120" height="60" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;

// Wide diagram with a single overlapping pair → ratio below threshold → local repair
const FLAT_SINGLE_PAIR = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n2" value="B" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="60" y="60" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n3" value="C" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="300" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n4" value="D" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="520" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n5" value="E" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="740" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n6" value="F" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="960" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n7" value="G" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="1180" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n8" value="H" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="1400" y="40" width="120" height="60" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;

const PORTS_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="test">
<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="hub" value="Hub" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="200" y="200" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="a" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="b" value="B" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="360" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="ea" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="hub" target="a">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="eb" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="hub" target="b">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;

describe('handleApply — guard rails', () => {
  it('rejects diagrams above MAX_NODES', async () => {
    const result = await handleApply(
      '', { nodes: [], edges: [], containers: [] }, [], 501, {}, 'unused.drawio',
    );
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain('Diagram too large');
  });
});

describe('handleApply — strategy selection', () => {
  it('uses ELK relayout when most cells are involved (container overlap)', async () => {
    const tmp = writeTmp(CONTAINER_OVERLAP);
    const { raw, graph } = parseDrawio(tmp);
    const result = await handleApply(raw, graph, [
      { type: 'node_overlap', severity: 'high', node_a: 'n1', node_b: 'n2' },
    ], graph.nodes.length, {}, tmp);
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('fixed');
    expect(parsed.message).toContain('nodes repositioned');
    cleanup(tmp);
  });

  it('uses local repair when only a small fraction is involved', async () => {
    const tmp = writeTmp(FLAT_SINGLE_PAIR);
    const { raw, graph } = parseDrawio(tmp);
    const result = await handleApply(raw, graph, [
      { type: 'node_overlap', severity: 'high', node_a: 'n1', node_b: 'n2' },
    ], graph.nodes.length, {}, tmp);
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('fixed');
    expect(parsed.message).toContain('Local repair');
    // Only the violating pair may move; other nodes keep their positions
    const after = fs.readFileSync(tmp, 'utf-8');
    expect(after).toContain('x="300" y="40"'); // n3 untouched
    expect(after).not.toBe(FLAT_SINGLE_PAIR);
    cleanup(tmp);
  });

  it('escalates to ELK with relayout=true even for a small violation', async () => {
    const tmp = writeTmp(FLAT_SINGLE_PAIR);
    const { raw, graph } = parseDrawio(tmp);
    const result = await handleApply(raw, graph, [
      { type: 'node_overlap', severity: 'high', node_a: 'n1', node_b: 'n2' },
    ], graph.nodes.length, { relayout: true }, tmp);
    const parsed = JSON.parse(result);
    expect(parsed.message).toContain('ELK');
    cleanup(tmp);
  });
});

describe('handleApply — ports-only fix (scope=ports)', () => {
  it('spreads exit anchors of sibling edges without moving nodes', async () => {
    const tmp = writeTmp(PORTS_DIAGRAM);
    const { raw, graph } = parseDrawio(tmp);
    const before = parseDrawio(tmp).graph;
    const result = await handleApply(raw, graph, [], graph.nodes.length, { scope: 'ports' }, tmp);
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('fixed');
    const after = fs.readFileSync(tmp, 'utf-8');
    // ea targets up-left → left port; eb targets up-right → right port
    expect(after).toContain('exitX=0;exitY=0.5;');
    expect(after).toContain('exitX=1;exitY=0.5;');
    // Node positions unchanged
    expect(after).toContain('x="200" y="200"');
    expect(parseDrawio(tmp).graph.nodes.map(n => n.x)).toEqual(before.nodes.map(n => n.x));
    cleanup(tmp);
  });

  it('reports already_good when every edge already has explicit anchors', async () => {
    const anchored = PORTS_DIAGRAM.replaceAll(
      'style="edgeStyle=orthogonalEdgeStyle;"',
      'style="edgeStyle=orthogonalEdgeStyle;exitX=0;exitY=0.5;entryX=1;entryY=0.5;"',
    );
    const tmp = writeTmp(anchored);
    const { raw, graph } = parseDrawio(tmp);
    const result = await handleApply(raw, graph, [], graph.nodes.length, { scope: 'ports' }, tmp);
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('already_good');
    expect(fs.readFileSync(tmp, 'utf-8')).toBe(anchored);
    cleanup(tmp);
  });
});

describe('normalizeLayoutArgs', () => {
  it('caps spacing at the MAX_SPACING upper bound', () => {
    const result = normalizeLayoutArgs({ spacing: 999999 });
    expect(result.spacing).toBe(500);
  });

  it('preserves valid custom values including scope', () => {
    const result = normalizeLayoutArgs({ algorithm: 'force', spacing: 120, direction: 'right', scope: 'ports' });
    expect(result).toEqual({
      algorithm: 'force', spacing: 120, direction: 'RIGHT', scope: 'ports', relayout: false,
    });
  });

  it('falls back non-numeric spacing to default', () => {
    expect(normalizeLayoutArgs({ spacing: 'wide' as unknown as number }).spacing).toBe(80);
  });

  it('defaults scope to auto and relayout to false', () => {
    const result = normalizeLayoutArgs({});
    expect(result.scope).toBe('auto');
    expect(result.relayout).toBe(false);
  });

  it('falls back invalid scope to auto', () => {
    expect(normalizeLayoutArgs({ scope: 'everything' }).scope).toBe('auto');
  });
});

function writeTmp(xml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-apply-test-'));
  const file = path.join(dir, 'test.drawio');
  fs.writeFileSync(file, xml, 'utf-8');
  return file;
}

function cleanup(file: string): void {
  try { fs.rmSync(path.dirname(file), { recursive: true, force: true }); } catch { /* ignore */ }
}
