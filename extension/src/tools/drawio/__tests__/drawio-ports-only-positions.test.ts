/**
 * SA4E-406 — regression lock: on scope='ports' the FULL apply → verify-loop →
 * enforceFinalGate flow must KEEP all node positions (FSD §3.1 L374).
 *
 * PD-QA1: round 4b threaded portsOnly into commitLayout/snapDiagramToGrid, but
 * enforceFinalGate re-snapped WITHOUT the flag and ran debunch() again, moving
 * node c (400,80)->(400,100) and dishonestly reporting status='fixed'.
 *
 * This file is the regression lock for the enforceFinalGate fix. QA-11
 * (drawio-scope-args.test.ts) re-enables the same contract separately.
 *
 * Contract enforced here:
 *   - every node position is preserved through the final gate (pure grid
 *     rounding only, no debunch / subtree-separation movement);
 *   - edge anchors are still spread (ports-only is about anchors, not nodes);
 *   - the gate's OTHER invariants still hold on the ports path: on-grid,
 *     no <mxfile> root, re-parse-valid output;
 *   - status stays 'partial' and node_proximity stays reported (honesty over
 *     silent rewrite).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeLocalTool } from '../../../backend-local-tools/registry';
import { parseDrawio, parseDrawioXml } from '../drawio-parser';
import { absoluteRects, GRID_STEP } from '../drawio-geometry';

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const node = (id: string, x: number, y: number): string =>
  `<mxCell id="${id}" value="${id}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string): string =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

/** The QA-11 fan fixture: a fans out to b/c/d; c sits only 20px under b — a
 *  real blocking proximity issue the ports scope must NOT fix by moving nodes. */
const fanXml = () => wrap(
  node('a', 0, 150) + node('b', 400, 0) + node('c', 400, 80) + node('d', 400, 300)
  + edge('e1', 'a', 'b') + edge('e2', 'a', 'c') + edge('e3', 'a', 'd'),
);

let dir = '';
let previousRoots: string | undefined;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-ports-only-'));
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
  return JSON.parse(res.content[0].text);
}

function expectOnGridAndMxfileFree(file: string): void {
  const text = fs.readFileSync(file, 'utf-8');
  expect(text.trimStart().startsWith('<mxGraphModel')).toBe(true);
  expect(text).not.toContain('<mxfile');
  const graph = parseDrawio(file).graph;
  for (const r of absoluteRects(graph).values()) {
    expect(r.x % GRID_STEP).toBe(0);
    expect(r.y % GRID_STEP).toBe(0);
  }
}

describe('SA4E-406 scope=ports — positions preserved through apply+verify+final-gate', () => {
  it('moves no node, spreads anchors, stays partial and honest', async () => {
    const before = absoluteRects(parseDrawioXml(fanXml()));
    const out = await runTool('fan-ports.drawio', fanXml(), { scope: 'ports' });
    const file = path.join(dir, 'fan-ports.drawio');
    const { graph } = parseDrawio(file);
    const after = absoluteRects(graph);

    // Core regression lock: every node position is preserved (400,80 stays 400,80).
    for (const [id, r] of before) {
      expect(after.get(id)!.x).toBe(r.x);
      expect(after.get(id)!.y).toBe(r.y);
    }

    // Edge anchors ARE spread (ports-only is anchors only).
    const exits = ['e1', 'e2', 'e3'].map(id => graph.edges.find(e => e.id === id)!.exit!);
    expect(new Set(exits.map(p => p.y)).size).toBe(3);
    expect(graph.edges.every(e => e.exit && !e.entry)).toBe(true);

    // Honesty: bunched nodes stay flagged — status partial, proximity reported.
    expect(out.status).toBe('partial');
    expect(out.strategy_used).toBe('ports_only');
    expect(out.issues.some((i: any) => i.type === 'node_proximity')).toBe(true);
  }, 60_000);

  it('still enforces the final-gate invariants on the ports path', async () => {
    const out = await runTool('fan-ports-invariants.drawio', fanXml(), { scope: 'ports' });
    const file = path.join(dir, 'fan-ports-invariants.drawio');
    expectOnGridAndMxfileFree(file);
    // The gate must not silently "fix" proximity by moving nodes.
    expect(out.status).toBe('partial');
    expect(out.repositioned_nodes).toEqual([]);
  }, 60_000);
});
