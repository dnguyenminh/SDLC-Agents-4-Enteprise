/**
 * SA4E-406 — adversarial regressions for the transactional-write, strategy and
 * detector-isolation guarantees. Every case uses real files and the real tool.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PathLike } from 'fs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeLocalTool } from '../../../backend-local-tools/registry';
import { commitLayout } from '../drawio-apply-validate';
import { violationRatio } from '../drawio-apply-args';
import { detectAllIssues } from '../drawio-detect';
import { parseDrawioXml } from '../drawio-parser';
import * as elkLayout from '../elk-layout';

const fsControl = vi.hoisted(() => ({
  actualRename: undefined as undefined | ((from: PathLike, to: PathLike) => void),
  rename: vi.fn(),
}));
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>();
  fsControl.actualRename = actual.renameSync;
  fsControl.rename.mockImplementation(actual.renameSync);
  const rename = (from: PathLike, to: PathLike): void => fsControl.rename(from, to);
  return { ...actual, default: { ...actual, renameSync: rename }, renameSync: rename };
});

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const node = (id: string, x: number, y: number, parent = '1'): string =>
  `<mxCell id="${id}" value="${id}" style="rounded=1;" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/></mxCell>`;
const edge = (id: string, source: string, target: string): string =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

let dir = '';
let previousRoots: string | undefined;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-adversarial-'));
  previousRoots = process.env['MCP_WORKSPACE_ROOTS'];
  process.env['MCP_WORKSPACE_ROOTS'] = dir;
});
afterAll(() => {
  if (previousRoots === undefined) delete process.env['MCP_WORKSPACE_ROOTS'];
  else process.env['MCP_WORKSPACE_ROOTS'] = previousRoots;
  fs.rmSync(dir, { recursive: true, force: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  fsControl.rename.mockReset();
  fsControl.rename.mockImplementation(fsControl.actualRename!);
});

async function runTool(name: string, xml: string, extra: Record<string, unknown> = {}): Promise<any> {
  const file = path.join(dir, name);
  fs.writeFileSync(file, xml, 'utf-8');
  const result = await executeLocalTool('drawio_auto_layout', { file_path: file, base_dir: dir, ...extra }) as
    { isError: boolean; content: Array<{ type: string; text: string }> };
  return { file, result, out: JSON.parse(result.content[0].text) };
}

describe('SA4E-406 violationRatio — blocking cell coverage', () => {
  it('maps an edge crossing to its endpoint cells and the crossed node', () => {
    const graph = parseDrawioXml(wrap(node('a', 0, 0) + node('b', 200, 0) + node('c', 400, 0) + node('d', 600, 0) + edge('e', 'a', 'b')));
    const issues = [{
      type: 'edge_crossing', severity: 'high', edge_id: 'e',
      edge_source: 'a', edge_target: 'b', crosses_node: 'c',
    }];
    expect(violationRatio(graph, issues)).toBe(0.75);
  });

  it('maps edge_a/edge_b through both edges and ignores low-severity issues', () => {
    const graph = parseDrawioXml(wrap(
      node('a', 0, 0) + node('b', 200, 0) + node('c', 400, 0) + node('d', 600, 0)
      + edge('e1', 'a', 'b') + edge('e2', 'c', 'd'),
    ));
    const issues = [
      { type: 'edge_edge_crossing', severity: 'medium', edge_a: 'e1', edge_b: 'e2' },
      { type: 'node_proximity', severity: 'low', node_a: 'a', node_b: 'b' },
    ];
    expect(violationRatio(graph, issues)).toBe(1);
  });
});

describe('SA4E-406 detector thresholds and proximity contract', () => {
  it('keeps concurrent per-run thresholds isolated', async () => {
    const graph = parseDrawioXml(wrap(node('a', 100, 100) + node('b', 230, 100)));
    const [sensitive, tolerant] = await Promise.all([
      Promise.resolve().then(() => detectAllIssues(graph, { gap: 40, overlap: 0.05 } as any)),
      Promise.resolve().then(() => detectAllIssues(graph, { gap: 5, overlap: 0.5 } as any)),
    ]);
    expect(sensitive.some(i => i.type === 'node_proximity')).toBe(true);
    expect(tolerant.some(i => i.type === 'node_proximity')).toBe(false);
  });

  it('never destructively relayouts a proximity-only diagram', async () => {
    const xml = wrap(node('a', 100, 100) + node('b', 230, 100));
    const file = path.join(dir, 'proximity-only.drawio');
    fs.writeFileSync(file, xml, 'utf-8');
    const beforeEntries = fs.readdirSync(dir);
    await runTool('proximity-only.drawio', xml);
    expect(fs.readFileSync(file, 'utf-8')).toBe(xml);
    expect(fs.readdirSync(dir)).toEqual(beforeEntries);
  });
});

describe('SA4E-406 transactional writes', () => {
  it('leaves original bytes intact when the final rename fails', () => {
    const file = path.join(dir, 'rename-failure.drawio');
    const original = wrap(node('a', 100, 100));
    fs.writeFileSync(file, original, 'utf-8');
    const beforeEntries = fs.readdirSync(dir);
    fsControl.rename.mockImplementationOnce(((from: PathLike, to: PathLike) => {
      if (to === file) throw new Error('injected rename failure');
      return fsControl.actualRename!(from, to);
    }) as typeof fsControl.rename);
    expect(() => commitLayout(wrap(node('a', 200, 100)), file)).toThrow(/injected rename failure/);
    expect(fs.readFileSync(file, 'utf-8')).toBe(original);
    expect(fs.readdirSync(dir)).toEqual(beforeEntries);
  });

  it('restores exact original bytes after an ELK exception', async () => {
    const band = '<mxCell id="band" value="Band" style="rounded=0;dashed=1;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="400" height="300" as="geometry"/></mxCell>';
    const xml = wrap(band + node('a', 100, 100) + node('b', 110, 110));
    const file = path.join(dir, 'elk-failure.drawio');
    fs.writeFileSync(file, xml, 'utf-8');
    const beforeEntries = fs.readdirSync(dir);
    vi.spyOn(elkLayout, 'runElkLayout').mockRejectedValue(new Error('injected ELK failure'));
    await executeLocalTool('drawio_auto_layout', { file_path: file, base_dir: dir, algorithm: 'force' });
    expect(fs.readFileSync(file, 'utf-8')).toBe(xml);
    expect(fs.readdirSync(dir)).toEqual(beforeEntries);
  });
});
