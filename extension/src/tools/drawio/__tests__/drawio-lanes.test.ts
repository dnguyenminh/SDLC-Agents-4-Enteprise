/**
 * SA4E-406 — swimlane (cross-functional flow) layout, container header
 * insets, cycle-aware layering and raw '>' handling in LLM labels.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseDrawio } from '../drawio-parser';
import { detectAllIssues } from '../drawio-detect';
import { handleApply } from '../drawio-apply';
import { sanitizeDrawioXml, escapeAttributeValues } from '../drawio-xml-sanitize';
import { dropBackEdges } from '../drawio-humanize-elk';
import { containerInsets, headerThickness } from '../drawio-container-insets';
import { absoluteRects } from '../drawio-geometry';

describe('container insets', () => {
  it('keeps children clear of a top title strip', () => {
    expect(containerInsets('swimlane;startSize=26;').top).toBe(40);
    expect(containerInsets('swimlane;startSize=26;').left).toBe(20);
  });
  it('keeps children clear of a left title strip (horizontal=0)', () => {
    const i = containerInsets('swimlane;horizontal=0;startSize=110;');
    expect(i.left).toBe(124);
    expect(i.top).toBe(20);
  });
  it('plain boundary boxes have no header', () => {
    expect(headerThickness('rounded=0;dashed=1;')).toBe(0);
    expect(containerInsets('rounded=0;dashed=1;')).toEqual({ top: 20, left: 20, right: 20, bottom: 20 });
  });
});

describe('dropBackEdges', () => {
  it('drops only the edge that closes the cycle, in declaration order', () => {
    const kept = dropBackEdges(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']]);
    expect(kept).toEqual([['a', 'b'], ['b', 'c']]);
  });
  it('keeps an acyclic graph untouched', () => {
    const pairs: Array<[string, string]> = [['a', 'b'], ['a', 'c'], ['b', 'c']];
    expect(dropBackEdges(['a', 'b', 'c'], pairs)).toEqual(pairs);
  });
});

describe('raw > in labels', () => {
  it('is escaped so tag-scanning patchers cannot cut the cell open tag', () => {
    const out = escapeAttributeValues('<mxCell id="a" value="CLI > Chrome"/>');
    expect(out.xml).toContain('value="CLI &gt; Chrome"');
  });
});

const lane = (id: string, label: string, y: number) =>
  `<mxCell id="${id}" value="${label}" style="swimlane;horizontal=0;startSize=100;" vertex="1" parent="1"><mxGeometry x="0" y="${y}" width="200" height="100" as="geometry"/></mxCell>`;
const step = (id: string, parent: string, label = id) =>
  `<mxCell id="${id}" value="${label}" style="rounded=1;" vertex="1" parent="${parent}"><mxGeometry x="500" y="500" width="120" height="50" as="geometry"/></mxCell>`;
const flow = (id: string, s: string, t: string) =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

// 3 actors, 6 hand-offs across them, a feedback loop back to step 2, a raw '>' label
const LANE_FLOW = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
${lane('A', 'Actor A', 0)}${lane('B', 'Actor B', 100)}${lane('C', 'Actor C', 200)}
${step('s1', 'A')}${step('s2', 'B', 'CLI > Chrome')}${step('s3', 'C')}${step('s4', 'A')}${step('s5', 'B')}${step('s6', 'C')}
${flow('f1', 's1', 's2')}${flow('f2', 's2', 's3')}${flow('f3', 's3', 's4')}${flow('f4', 's4', 's5')}${flow('f5', 's5', 's6')}${flow('loop', 's6', 's2')}
</root></mxGraphModel>`;

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

async function layout(xml: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dio-lane-'));
  dirs.push(dir);
  const file = path.join(dir, 'd.drawio');
  fs.writeFileSync(file, sanitizeDrawioXml(xml).xml, 'utf-8');
  const { raw, graph } = parseDrawio(file);
  await handleApply(raw, graph, detectAllIssues(graph), graph.nodes.length + graph.containers.length, {}, file);
  return file;
}

describe('swimlane flow layout', () => {
  it('runs the flow left→right across lanes stacked as rows', async () => {
    const { graph } = parseDrawio(await layout(LANE_FLOW));
    const rects = absoluteRects(graph);
    const xs = ['s1', 's2', 's3', 's4', 's5', 's6'].map(id => rects.get(id)!.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs); // declared order == left→right
    const laneY = ['A', 'B', 'C'].map(id => rects.get(id)!.y);
    expect([...laneY].sort((a, b) => a - b)).toEqual(laneY);
    expect(new Set(['A', 'B', 'C'].map(id => rects.get(id)!.x)).size).toBe(1); // aligned lanes
  }, 60_000);

  it('keeps steps clear of the left title strip and inside their lane', async () => {
    const { graph } = parseDrawio(await layout(LANE_FLOW));
    const rects = absoluteRects(graph);
    for (const [step, laneId] of [['s1', 'A'], ['s2', 'B'], ['s3', 'C'], ['s4', 'A']] as const) {
      const s = rects.get(step)!, l = rects.get(laneId)!;
      expect(s.x).toBeGreaterThanOrEqual(l.x + 100); // startSize=100
      expect(s.y).toBeGreaterThanOrEqual(l.y);
      expect(s.y + s.h).toBeLessThanOrEqual(l.y + l.h);
    }
  }, 60_000);

  it('leaves no blocking issues, including the feedback edge and the raw > label', async () => {
    const file = await layout(LANE_FLOW);
    const { graph } = parseDrawio(file);
    expect(detectAllIssues(graph).filter(i => i.severity !== 'low')).toEqual([]);
    expect(fs.readFileSync(file, 'utf-8')).toContain('CLI &gt; Chrome');
  }, 60_000);

  it('does not treat independent bands as a lane flow (no cross-lane edges)', async () => {
    const bands = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
${lane('A', 'A', 0)}${lane('B', 'B', 100)}${step('a1', 'A')}${step('a2', 'A')}${step('b1', 'B')}${step('b2', 'B')}
${flow('x', 'a1', 'a2')}${flow('y', 'b1', 'b2')}</root></mxGraphModel>`;
    const { graph } = parseDrawio(await layout(bands));
    const rects = absoluteRects(graph);
    // band mode packs bands in a grid; each band still holds exactly its own steps
    expect(graph.nodes.filter(n => n.parentId === 'A').map(n => n.id).sort()).toEqual(['a1', 'a2']);
    expect(rects.get('a1')!.x).toBeLessThan(rects.get('a2')!.x);
  }, 60_000);
});
