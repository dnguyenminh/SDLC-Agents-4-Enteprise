/**
 * SA4E-406 — `scope` parameter (FSD 3.1.4 data field, BRD STORY 1 reconciliation):
 *   - parsing: auto | positions | ports accepted, anything else → default 'auto'
 *     (defaults stay unchanged when the param is absent);
 *   - scope='ports' — spread edge anchors ONLY, never move a node (cosmetic
 *     proximity stays reported but does not make the run partial);
 *   - scope='positions' — force the full humanized relayout; the default path
 *     never rewrites a proximity-only diagram.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeLocalTool } from '../../../backend-local-tools/registry';
import { parseDrawio, parseDrawioXml } from '../drawio-parser';
import { normalizeLayoutArgs } from '../drawio-apply-args';
import { absoluteRects } from '../drawio-geometry';

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const node = (id: string, x: number, y: number): string =>
  `<mxCell id="${id}" value="${id}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string): string =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

let dir = '';
let previousRoots: string | undefined;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-scope-'));
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

describe('SA4E-406 scope parsing — defaults stay unchanged (A1 family)', () => {
  it('absent or unknown scope normalizes to auto', () => {
    expect(normalizeLayoutArgs({}).scope).toBe('auto');
    expect(normalizeLayoutArgs({ scope: 'everything' }).scope).toBe('auto');
    expect(normalizeLayoutArgs({ scope: 42 }).scope).toBe('auto');
  });

  it('accepts the three documented values verbatim', () => {
    expect(normalizeLayoutArgs({ scope: 'auto' }).scope).toBe('auto');
    expect(normalizeLayoutArgs({ scope: 'positions' }).scope).toBe('positions');
    expect(normalizeLayoutArgs({ scope: 'ports' }).scope).toBe('ports');
  });

  it('spacing above the 500px cap is clamped, not rejected (BR-23)', () => {
    expect(normalizeLayoutArgs({ spacing: 9999 }).spacing).toBe(500);
    expect(normalizeLayoutArgs({ spacing: 80 }).spacing).toBe(80);
  });
});

describe("SA4E-406 scope='ports' — anchors spread, node positions kept", () => {
  // Contract: every node position is preserved (c stays 400,80), anchors are
  // spread, and proximity remains visible as a LOW issue without blocking.
  it('writes one distinct exit anchor per fan edge and moves no node', async () => {
    // a fans out to b/c/d; c sits only 20px under b — a real blocking issue the
    // ports scope must NOT fix by moving nodes.
    const xml = wrap(
      node('a', 0, 150) + node('b', 400, 0) + node('c', 400, 80) + node('d', 400, 300)
      + edge('e1', 'a', 'b') + edge('e2', 'a', 'c') + edge('e3', 'a', 'd'),
    );
    const before = absoluteRects(parseDrawioXml(xml));
    const out = await runTool('fan-ports.drawio', xml, { scope: 'ports' });
    const file = path.join(dir, 'fan-ports.drawio');
    const { graph } = parseDrawio(file);
    const after = absoluteRects(graph);
    for (const [id, r] of before) {
      expect(after.get(id)!.x).toBe(r.x); // positions kept — anchors only
      expect(after.get(id)!.y).toBe(r.y);
    }
    const exits = ['e1', 'e2', 'e3'].map(id => graph.edges.find(e => e.id === id)!.exit!);
    expect(new Set(exits.map(p => p.y)).size).toBe(3); // 0.25 / 0.5 / 0.75
    expect(graph.edges.every(e => e.exit && !e.entry)).toBe(true);
    expect(out.status).toBe('fixed');
    expect(out.issues.some((i: any) => i.type === 'node_proximity' && i.severity === 'low')).toBe(true);
  }, 60_000);
});

describe("SA4E-406 scope='positions' — forces the full humanized relayout", () => {
  // 6 nodes, one bunched pair (b–c gap 10px). Proximity is cosmetic: the
  // default path leaves it alone, while scope=positions explicitly relayouts.
  const BUNCHED = (): string => wrap(
    node('a', 100, 100) + node('b', 300, 100) + node('c', 430, 100)
    + node('d', 700, 100) + node('e', 100, 300) + node('f', 700, 300),
  );

  it('escalates to humanized_layered only when scope=positions asks for it', async () => {
    const withScope = await runTool('bunched-positions.drawio', BUNCHED(), { scope: 'positions' });
    expect(withScope.strategy_used).toBe('humanized_layered');
    const auto = await runTool('bunched-auto.drawio', BUNCHED());
    expect(auto.status).toBe('already_good');
    expect(auto.strategy_used).toBeUndefined();
    expect(fs.readFileSync(path.join(dir, 'bunched-auto.drawio'), 'utf-8')).toBe(BUNCHED());
  }, 60_000);
});
