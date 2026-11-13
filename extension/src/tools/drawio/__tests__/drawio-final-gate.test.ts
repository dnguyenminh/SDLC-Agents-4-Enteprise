/**
 * SA4E-406 — final-gate bypass attempts (f/i): EVERY tool exit ends on-grid,
 * mxfile-free and re-parse valid — including the exits that bypass the
 * strategies' commitLayout:
 *   preflight unwrap+repair → repair path, adopt rewrite → repair path,
 *   already_good exit, report-only exit, and the shared enforceFinalGate itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeLocalTool } from '../../../backend-local-tools/registry';
import { parseDrawio, parseDrawioXml } from '../drawio-parser';
import { detectAllIssues } from '../drawio-detect';
import { enforceFinalGate } from '../drawio-apply-validate';
import { absoluteRects, GRID_STEP } from '../drawio-geometry';

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const node = (id: string, x: number, y: number, style = 'rounded=1;'): string =>
  `<mxCell id="${id}" value="${id}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string, extra = ''): string =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;${extra}" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"><mxPoint x="5" y="5" as="sourcePoint"/><Array as="points"><mxPoint x="9" y="9"/></Array></mxGeometry></mxCell>`;

let dir = '';
let previousRoots: string | undefined;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-gate-'));
  previousRoots = process.env['MCP_WORKSPACE_ROOTS'];
  process.env['MCP_WORKSPACE_ROOTS'] = dir;
});
afterAll(() => {
  if (previousRoots === undefined) delete process.env['MCP_WORKSPACE_ROOTS']; else process.env['MCP_WORKSPACE_ROOTS'] = previousRoots;
  fs.rmSync(dir, { recursive: true, force: true });
});

async function runTool(name: string, xml: string, extra: Record<string, unknown> = {}): Promise<any> {
  const file = path.join(dir, name);
  fs.writeFileSync(file, xml, 'utf-8');
  const res = await executeLocalTool('drawio_auto_layout', { file_path: file, base_dir: dir, ...extra }) as
    { isError: boolean; content: Array<{ type: string; text: string }> };
  expect(res.isError).toBe(false);
  return { out: JSON.parse(res.content[0].text), file };
}

/** The invariant every exit must satisfy. */
function expectOnGridAndMxfileFree(file: string): { graph: ReturnType<typeof parseDrawioXml> } {
  const text = fs.readFileSync(file, 'utf-8');
  expect(text.trimStart().startsWith('<mxGraphModel')).toBe(true);
  expect(text).not.toContain('<mxfile');
  const graph = parseDrawio(file).graph;
  for (const r of absoluteRects(graph).values()) {
    expect(r.x % GRID_STEP).toBe(0);
    expect(r.y % GRID_STEP).toBe(0);
  }
  return { graph };
}

describe('SA4E-406 final gate — enforceFinalGate itself', () => {
  it('snaps off-grid vertices, labels the unambiguous branch and drops stale hints', () => {
    const file = path.join(dir, 'gate-unit.drawio');
    fs.writeFileSync(file, wrap(
      node('d', 103, 107, 'rhombus;') + node('t1', 90, 320) + node('t2', 410, 117)
      + edge('yes', 'd', 't1') + edge('no', 'd', 't2'),
    ), 'utf-8');
    enforceFinalGate(file);
    const { graph } = expectOnGridAndMxfileFree(file);
    expect(graph.edges.find(e => e.id === 'yes')?.label).toBe('Yes');
    expect(graph.edges.find(e => e.id === 'no')?.label).toBe('No');
    expect(fs.readFileSync(file, 'utf-8')).not.toMatch(/as="sourcePoint"/);
  });
});

describe('SA4E-406 final gate — every tool exit ends on-grid + mxfile-free', () => {
  it('already_good exit leaves a clean diagram byte-identical', async () => {
    const clean = wrap(node('a', 100, 100) + node('b', 500, 300) + edge('e', 'a', 'b'));
    const { out, file } = await runTool('clean.drawio', clean);
    expect(out.status).toBe('already_good');
    expect(fs.readFileSync(file, 'utf-8')).toBe(clean); // write-only-when-changed
    expectOnGridAndMxfileFree(file);
  }, 60_000);

  it('preflight unwrap + repair: wrapped off-grid input ends unwrapped and on-grid', async () => {
    const wrapped = `<mxfile host="app.diagrams.net"><diagram name="P">${wrap(
      node('a', 103, 107) + node('b', 113, 117) + edge('e', 'a', 'b'),
    )}</diagram></mxfile>`;
    const { out, file } = await runTool('wrapped-offgrid.drawio', wrapped);
    expect(['fixed', 'partial']).toContain(out.status);
    expectOnGridAndMxfileFree(file);
  }, 60_000);

  it('adopt rewrite: boxes drawn over an empty band are adopted, then land on-grid', async () => {
    const band = `<mxCell id="B1" value="Band" style="rounded=0;whiteSpace=wrap;html=1;fillColor=none;dashed=1;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="400" height="300" as="geometry"/></mxCell>`;
    const xml = wrap(band + node('x', 103, 107) + node('y', 233, 117));
    const { out, file } = await runTool('adopt.drawio', xml);
    const { graph } = expectOnGridAndMxfileFree(file);
    expect(graph.nodes.find(n => n.id === 'x')?.parentId).toBe('B1');
    expect(graph.nodes.find(n => n.id === 'y')?.parentId).toBe('B1');
    expect(detectAllIssues(graph).some(i => i.type === 'child_outside_container')).toBe(false);
    expect(['fixed', 'partial']).toContain(out.status);
  }, 60_000);

  it('report-only exit: positions stay untouched, titles are never invented', async () => {
    const laneCell = (id: string, y: number): string =>
      `<mxCell id="${id}" value="" style="swimlane;startSize=30;" vertex="1" parent="1"><mxGeometry x="0" y="${y}" width="400" height="200" as="geometry"/></mxCell>`;
    const xml = wrap(
      laneCell('A', 0) + laneCell('B', 210)
      + `<mxCell id="a1" value="s1" style="rounded=1;" vertex="1" parent="A"><mxGeometry x="60" y="60" width="120" height="60" as="geometry"/></mxCell>`
      + `<mxCell id="b1" value="s2" style="rounded=1;" vertex="1" parent="B"><mxGeometry x="60" y="60" width="120" height="60" as="geometry"/></mxCell>`,
    );
    const { out, file } = await runTool('report-only.drawio', xml);
    expect(out.status).toBe('partial'); // honest — empty titles need a human
    const after = fs.readFileSync(file, 'utf-8');
    expect(after).toBe(xml); // nothing to snap or label — untouched bytes
    expectOnGridAndMxfileFree(file);
  }, 60_000);
});
