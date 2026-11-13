/**
 * SA4E-406 — edge labels on swimlane titles (detector) and the slot-swap
 * optimisation that removes them by exchanging interchangeable siblings.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseDrawio, parseDrawioXml } from '../drawio-parser';
import { detectAllIssues } from '../drawio-detect';
import { detectLabelOnHeader } from '../drawio-detect-labels';
import { handleApply } from '../drawio-apply';
import { sanitizeDrawioXml } from '../drawio-xml-sanitize';
import { optimizeSlots, swapCandidates } from '../drawio-slot-swap';
import { placeLabels } from '../drawio-label-place';

const lane = (id: string, y: number) =>
  `<mxCell id="${id}" value="${id}" style="swimlane;startSize=40;" vertex="1" parent="1"><mxGeometry x="0" y="${y}" width="600" height="200" as="geometry"/></mxCell>`;
const box = (id: string, parent: string, x: number, y: number, w = 200) =>
  `<mxCell id="${id}" value="${id}" style="rounded=1;" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="60" as="geometry"/></mxCell>`;
const labelled = (id: string, s: string, t: string, label: string) =>
  `<mxCell id="${id}" value="${label}" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
const model = (cells: string) => `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;

// Edge from the top lane straight down to the bottom lane: its midpoint sits on lane B's title
// a: bottom at y=120; b: top at y=220+140=360 → midpoint y=240 lies in B's title strip (220..260)
const ON_HEADER = model(`${lane('A', 0)}${lane('B', 220)}${box('a', 'A', 200, 60)}${box('b', 'B', 200, 140)}${labelled('e', 'a', 'b', 'queries snapshot')}`);

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe('edge_label_on_header', () => {
  it('flags a label centred on a swimlane title strip', () => {
    const issues = detectLabelOnHeader(parseDrawioXml(ON_HEADER));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ type: 'edge_label_on_header', severity: 'medium', edge_id: 'e', container: 'B' });
  });

  it('ignores unlabeled edges and labels clear of any title', () => {
    expect(detectLabelOnHeader(parseDrawioXml(ON_HEADER.replace('queries snapshot', '')))).toEqual([]);
    const clear = model(`${lane('A', 0)}${box('a', 'A', 20, 60)}${box('b', 'A', 360, 60)}${labelled('e', 'a', 'b', 'x')}`);
    expect(detectLabelOnHeader(parseDrawioXml(clear))).toEqual([]);
  });
});

describe('edge_label_on_node', () => {
  it('flags a label drawn over a box that is not an endpoint of the edge', () => {
    // a → b runs horizontally at y=90; its midpoint label (x≈310) lands on box 'mid'
    const xml = model(`${lane('A', 0)}${box('a', 'A', 0, 60, 100)}${box('mid', 'A', 260, 70, 100)}${box('b', 'A', 520, 60, 100)}${labelled('e', 'a', 'b', 'label')}`);
    const issues = detectAllIssues(parseDrawioXml(xml)).filter(i => i.type === 'edge_label_on_node');
    expect(issues).toEqual([expect.objectContaining({ edge_id: 'e', node: 'mid' })]);
  });
});

describe('label placement', () => {
  it('slides a label off the box under the middle of its edge', () => {
    const xml = model(`${lane('A', 0)}${box('a', 'A', 0, 60, 100)}${box('mid', 'A', 260, 70, 100)}${box('b', 'A', 520, 60, 100)}${labelled('e', 'a', 'b', 'label')}`);
    const moved = placeLabels(xml);
    expect(parseDrawioXml(moved).edges[0].labelPos).not.toBe(0);
    expect(detectAllIssues(parseDrawioXml(moved)).filter(i => i.type === 'edge_label_on_node')).toEqual([]);
  });

  it('leaves labels that are already clear untouched', () => {
    const clear = model(`${lane('A', 0)}${box('a', 'A', 20, 60)}${box('b', 'A', 360, 60)}${labelled('e', 'a', 'b', 'x')}`);
    expect(placeLabels(clear)).toBe(clear);
  });
});

describe('slot swap', () => {
  it('only pairs same-size siblings where at least one is connected', () => {
    const g = parseDrawioXml(model(`${lane('A', 0)}${box('a', 'A', 20, 60)}${box('b', 'A', 300, 60)}${box('wide', 'A', 20, 140, 400)}${box('c', 'A', 500, 60)}${labelled('e', 'a', 'wide', '')}`));
    const pairs = swapCandidates(g).map(([x, y]) => `${x.id}-${y.id}`);
    expect(pairs).toEqual(['a-b', 'a-c']); // wide differs in size; b-c carry no edge
  });

  it('leaves a diagram without blocking issues byte-identical', () => {
    const clean = sanitizeDrawioXml(model(`${lane('A', 0)}${box('a', 'A', 20, 60)}${box('b', 'A', 360, 60)}`)).xml;
    expect(optimizeSlots(clean)).toBe(clean);
  });

  it('relayout of the architecture-layers diagram leaves no label on a layer title', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dio-swap-'));
    dirs.push(dir);
    const file = path.join(dir, 'd.drawio');
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'architecture-layers.drawio'), file);
    const { raw, graph } = parseDrawio(file);
    await handleApply(raw, graph, detectAllIssues(graph), graph.nodes.length + graph.containers.length, {}, file);
    const after = detectAllIssues(parseDrawio(file).graph);
    expect(after.filter(i => i.type === 'edge_label_on_header' || i.type === 'edge_label_on_node')).toEqual([]);
    expect(after.filter(i => i.severity !== 'low')).toEqual([]);
  }, 60_000);
});
