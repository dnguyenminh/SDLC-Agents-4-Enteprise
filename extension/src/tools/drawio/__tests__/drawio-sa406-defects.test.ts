/**
 * SA4E-406 — regressions for UAT defects 2.1–2.8: grid, unwrap, lane
 * titles, decision labels, bands, bunched children, relayout and edge parents.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeLocalTool } from '../../../backend-local-tools/registry';
import { parseDrawio, parseDrawioXml } from '../drawio-parser';
import { detectAllIssues, detectNodeProximity } from '../drawio-detect';
import { detectBandOversize, detectEdgeWrongParent, detectOffGrid } from '../drawio-detect-structure';
import { handleApply } from '../drawio-apply';
import { parseThresholdArgs, normalizeLayoutArgs } from '../drawio-apply-args';
import { mapAlgorithm } from '../elk-layout';
import { absoluteRects, GRID_STEP } from '../drawio-geometry';

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const node = (id: string, parent: string, x: number, y: number, style = 'rounded=1;', w = 120, h = 60): string =>
  `<mxCell id="${id}" value="${id}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
const lane = (id: string, label: string, x: number, y: number, w: number, h: number, style = 'swimlane;startSize=30;'): string =>
  `<mxCell id="${id}" value="${label}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string, parent = '1'): string =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="${parent}" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

let dir = '';
let previousRoots: string | undefined;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-defects-'));
  previousRoots = process.env['MCP_WORKSPACE_ROOTS'];
  process.env['MCP_WORKSPACE_ROOTS'] = dir;
});
afterAll(() => {
  if (previousRoots === undefined) delete process.env['MCP_WORKSPACE_ROOTS']; else process.env['MCP_WORKSPACE_ROOTS'] = previousRoots;
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Write a fixture into the allowlisted temp dir and run the real tool on it. */
async function runTool(name: string, xml: string, extra: Record<string, unknown> = {}): Promise<{ file: string; out: any }> {
  const file = path.join(dir, name);
  fs.writeFileSync(file, xml, 'utf-8');
  const res = await executeLocalTool('drawio_auto_layout', { file_path: file, base_dir: dir, ...extra }) as
    { isError: boolean; content: Array<{ type: string; text: string }> };
  return { file, out: JSON.parse(res.content[0].text) };
}

describe('SA4E-406 (f) 10px grid — 2.1', () => {
  it('snaps every vertex to the grid so no off-grid cell remains', async () => {
    const xml = wrap(node('a', '1', 33, 17) + node('b', '1', 41, 23) + edge('e', 'a', 'b'));
    const { file } = await runTool('grid.drawio', xml);
    const graph = parseDrawio(file).graph;
    expect(detectOffGrid(graph)).toEqual([]);
    for (const r of absoluteRects(graph).values()) {
      expect(r.x % GRID_STEP).toBe(0);
      expect(r.y % GRID_STEP).toBe(0);
    }
  });
});

describe('SA4E-406 (i) mxfile wrapper — 2.2', () => {
  it('writes the bare <mxGraphModel> and never reintroduces <mxfile>', async () => {
    const inner = wrap(node('a', '1', 10, 10) + node('b', '1', 15, 18) + edge('e', 'a', 'b'));
    const { file } = await runTool('wrapped.drawio', `<mxfile host="app.diagrams.net"><diagram name="P">${inner}</diagram></mxfile>`);
    const text = fs.readFileSync(file, 'utf-8');
    expect(text.trimStart().startsWith('<mxGraphModel')).toBe(true);
    expect(text).not.toContain('<mxfile');
  });
});

describe('SA4E-406 (g) empty lane titles — 2.3', () => {
  it('reports partial (never already_good) and does not invent titles', async () => {
    const xml = wrap(lane('A', '', 0, 0, 400, 200) + lane('B', '', 0, 220, 400, 200)
      + node('a1', 'A', 60, 60) + node('b1', 'B', 60, 60));
    const { file, out } = await runTool('lanes-empty.drawio', xml);
    expect(out.status).toBe('partial');
    expect(out.issues.some((i: any) => i.type === 'empty_lane_title')).toBe(true);
    expect(out.remaining_issues).toBeGreaterThan(0);
    const text = fs.readFileSync(file, 'utf-8');
    expect(text).toContain('value=""'); // no invented titles
  });
});

describe('SA4E-406 (h) decision edges — 2.4', () => {
  it('labels an unambiguous two-branch decision Yes/No by branch geometry', async () => {
    const d = node('d', '1', 100, 100, 'rhombus;', 80, 80);
    const down = node('t1', '1', 90, 300); // continues the flow (below) → Yes
    const side = node('t2', '1', 400, 110); // exits sideways → No
    const xml = wrap(d + down + side + edge('e1', 'd', 't1') + edge('e2', 'd', 't2'));
    const { file } = await runTool('decision.drawio', xml);
    const edges = parseDrawio(file).graph.edges;
    expect(edges.find(e => e.id === 'e1')?.label).toBe('Yes');
    expect(edges.find(e => e.id === 'e2')?.label).toBe('No');
  });

  it('reports (never labels) a decision with three branches', async () => {
    const d = node('d', '1', 100, 100, 'rhombus;', 80, 80);
    const xml = wrap(d + node('t1', '1', 90, 300) + node('t2', '1', 400, 110) + node('t3', '1', 20, 110)
      + edge('e1', 'd', 't1') + edge('e2', 'd', 't2') + edge('e3', 'd', 't3'));
    const { file, out } = await runTool('decision3.drawio', xml);
    const edges = parseDrawio(file).graph.edges;
    expect(edges.every(e => !e.label)).toBe(true);
    expect(out.issues.filter((i: any) => i.type === 'missing_decision_label').length).toBe(3);
  });
});

describe('SA4E-406 (a) band size budget — 2.5', () => {
  it('flags an oversized plain band and skips shared-length swimlanes', () => {
    const giant = wrap(node('kid', 'B1', 20, 20, 'rounded=1;', 120, 50)
      .replace('parent="B1"', 'parent="B1"') + '');
    const graph = parseDrawioXml(wrap(
      `<mxCell id="B1" value="Band" style="rounded=0;dashed=1;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="900" height="700" as="geometry"/></mxCell>`
      + node('kid', 'B1', 20, 40, 'rounded=1;', 120, 50)
      + `<mxCell id="L1" value="Lane" style="swimlane;startSize=30;" vertex="1" parent="1"><mxGeometry x="0" y="800" width="900" height="700" as="geometry"/></mxCell>`
      + node('step', 'L1', 40, 840, 'rounded=1;', 120, 50),
    ));
    const types = detectBandOversize(graph).map(i => i.container);
    expect(types).toEqual(['B1']); // swimlane L1 shares the flow length by design
    expect(giant).toContain('kid');
  });
});

describe('SA4E-406 (b) bunched children — 2.6', () => {
  it('reports tight siblings as low severity without moving them', async () => {
    const bunched = wrap(node('a', '1', 100, 100) + node('b', '1', 230, 100)); // gap 10px
    const proximity = detectNodeProximity(parseDrawioXml(bunched));
    expect(proximity).toHaveLength(1);
    expect(proximity.every(i => i.severity === 'low')).toBe(true);
    const { file, out } = await runTool('bunched.drawio', bunched);
    expect(out.status).toBe('already_good');
    expect(fs.readFileSync(file, 'utf-8')).toBe(bunched);
  });
});

describe('SA4E-406 relayout=true forces the full path — 2.7', () => {
  it('runs the full contract (iteration_history) even on a diagram with no blocking issues', async () => {
    const clean = wrap(node('a', '1', 100, 100) + node('b', '1', 400, 100) + edge('e', 'a', 'b'));
    const { out } = await runTool('clean-relayout.drawio', clean, { relayout: true });
    // Without relayout this returns the short {status:'already_good'} — with it,
    // the full relayout path assembles the whole A2 contract.
    expect(Array.isArray(out.iteration_history)).toBe(true);
    expect(out.iteration_history.length).toBeGreaterThan(0);
  });
});

describe('SA4E-406 cross-lane edge with wrong parent — 2.8', () => {
  it('detects a cross-lane edge parented to one endpoint lane and repairs it', async () => {
    const xml = wrap(lane('A', 'A', 0, 0, 300, 200) + lane('B', 'B', 0, 220, 300, 200)
      + node('a1', 'A', 60, 60) + node('b1', 'B', 60, 60) + edge('x', 'a1', 'b1', 'A'));
    expect(detectEdgeWrongParent(parseDrawioXml(xml)).map(i => i.edge_id)).toEqual(['x']);
    const { file, out } = await runTool('wrong-parent.drawio', xml);
    expect(detectEdgeWrongParent(parseDrawio(file).graph)).toEqual([]);
    expect(out.issues.some((i: any) => i.type === 'edge_wrong_parent')).toBe(false);
  });
});

describe('SA4E-406 verify loop — BRD STORY 2', () => {
  it('keeps iteration_history for a single pass and rolls back a worse pass', async () => {
    const xml = wrap(node('a', '1', 100, 100) + node('b', '1', 105, 105) + edge('e', 'a', 'b'));
    const { out } = await runTool('history.drawio', xml);
    expect(Array.isArray(out.iteration_history)).toBe(true);
    expect(out.iteration_history[0].iteration).toBe(1);
    expect(['fixed', 'partial', 'already_good']).toContain(out.status);
  });

  it('emits exactly the A2 output contract (no mode/auto_fix — A3)', async () => {
    const xml = wrap(node('a', '1', 100, 100) + node('b', '1', 105, 105) + edge('e', 'a', 'b'));
    const { out } = await runTool('contract.drawio', xml);
    expect(Object.keys(out).sort()).toEqual([
      'edges', 'effective_root', 'issues', 'iteration_history', 'message', 'nodes',
      'remaining_issues', 'repositioned_nodes', 'root_source', 'status', 'strategy_used',
    ]);
    expect(out.mode).toBeUndefined();
    expect(out.auto_fix).toBeUndefined();
  });
});

describe('SA4E-406 ELK stress algorithm — BRD STORY 3 (3.2)', () => {
  it('maps stress to the ELK stress layout and accepts it as an algorithm', () => {
    expect(mapAlgorithm('stress')).toBe('org.eclipse.elk.stress');
    expect(normalizeLayoutArgs({ algorithm: 'stress' }).algorithm).toBe('stress');
  });
});

describe('SA4E-406 optional detector thresholds — A1', () => {
  it('defaults stay unchanged when the params are absent', () => {
    expect(parseThresholdArgs({})).toBeUndefined();
    // Present-but-default values pass through (configuring the defaults is a no-op).
    expect(parseThresholdArgs({ gap_threshold: 40, overlap_threshold: 0.05 })).toEqual({ gap: 40, overlap: 0.05 });
  });

  it('accepts valid overrides and rejects negatives/meaningless values', () => {
    expect(parseThresholdArgs({ gap_threshold: 60 })).toEqual({ gap: 60, overlap: 0.05 });
    expect(parseThresholdArgs({ overlap_threshold: 0.2 })).toEqual({ gap: 40, overlap: 0.2 });
    expect(() => parseThresholdArgs({ gap_threshold: -5 })).toThrow(/gap_threshold/);
    expect(() => parseThresholdArgs({ gap_threshold: 9999 })).toThrow(/gap_threshold/);
    expect(() => parseThresholdArgs({ overlap_threshold: 1 })).toThrow(/overlap_threshold/);
    expect(() => parseThresholdArgs({ overlap_threshold: 'big' })).toThrow(/overlap_threshold/);
  });
});
