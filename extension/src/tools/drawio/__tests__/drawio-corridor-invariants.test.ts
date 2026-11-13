/**
 * SA4E-406 — waypoint corridor invariants of the WHOLE tool after its fix
 * (BR-59 stale waypoints + BR-60 wrong parent, at tool level):
 *   - every edge is re-planned from the geometry actually written: no polyline
 *     cuts through any node it is not attached to (a skip edge may cross the
 *     middle lane's BACKGROUND, never its content);
 *   - cross-lane edges end parented to the lowest common container (root);
 *   - an unrelated, edge-less band is never used as a shortcut corridor.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeLocalTool } from '../../../backend-local-tools/registry';
import { parseDrawio } from '../drawio-parser';
import { detectAllIssues } from '../drawio-detect';
import { detectEdgeWrongParent } from '../drawio-detect-structure';
import { absoluteRects, ancestorsOf, cellIndex } from '../drawio-geometry';
import { edgePolyline } from '../drawio-polyline';
import { polylineHitsRect } from '../drawio-detect-edge-utils';

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const lane = (id: string, label: string, y: number): string =>
  `<mxCell id="${id}" value="${label}" style="swimlane;startSize=30;" vertex="1" parent="1"><mxGeometry x="0" y="${y}" width="900" height="200" as="geometry"/></mxCell>`;
/**
 * QA round 3 fix: the band is sized under the band budget so band_oversize
 * cannot fire — 400x180 with one 120x60 child is fill 0.1 < MIN_FILL 0.2 at
 * area 72,000 >= MIN_BAND_AREA 60,000 (drawio-detect-structure.ts), a genuine
 * oversize defect orthogonal to the corridor invariant this test verifies.
 */
const band = (id: string, label: string, x: number, y: number, w = 200, h = 150): string =>
  `<mxCell id="${id}" value="${label}" style="rounded=0;dashed=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
const node = (id: string, parent: string, x: number, y: number): string =>
  `<mxCell id="${id}" value="${id}" style="rounded=1;" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string): string =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

let dir = '';
let previousRoots: string | undefined;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-corridor-'));
  previousRoots = process.env['MCP_WORKSPACE_ROOTS'];
  process.env['MCP_WORKSPACE_ROOTS'] = dir;
});
afterAll(() => {
  if (previousRoots === undefined) delete process.env['MCP_WORKSPACE_ROOTS']; else process.env['MCP_WORKSPACE_ROOTS'] = previousRoots;
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Run the real tool on a fixture in the allowlisted temp dir. */
async function runTool(name: string, xml: string): Promise<any> {
  const file = path.join(dir, name);
  fs.writeFileSync(file, xml, 'utf-8');
  const res = await executeLocalTool('drawio_auto_layout', { file_path: file, base_dir: dir }) as
    { isError: boolean; content: Array<{ type: string; text: string }> };
  expect(res.isError).toBe(false);
  return JSON.parse(res.content[0].text);
}

/** Polylines of the written file, keyed by edge id (absolute px). */
function polylinesOf(file: string): Map<string, Array<{ x: number; y: number }>> {
  const { graph } = parseDrawio(file);
  const rects = absoluteRects(graph);
  const byId = cellIndex(graph);
  const originOf = (parentId: string): { x: number; y: number } => {
    for (const anc of ancestorsOf(parentId, byId)) {
      const r = rects.get(anc);
      if (r) return { x: r.x, y: r.y };
    }
    return { x: 0, y: 0 };
  };
  const out = new Map<string, Array<{ x: number; y: number }>>();
  for (const e of graph.edges) out.set(e.id, edgePolyline(e, rects, originOf));
  return out;
}

/** Ids of nodes a polyline enters the interior of, excluding the edge's own endpoints. */
function hitNodes(edgeId: string, line: Array<{ x: number; y: number }>, file: string): string[] {
  const { graph } = parseDrawio(file);
  const rects = absoluteRects(graph);
  const e = graph.edges.find(x => x.id === edgeId)!;
  const out: string[] = [];
  for (const n of graph.nodes) {
    if (n.id === e.sourceId || n.id === e.targetId) continue;
    if (polylineHitsRect(line, rects.get(n.id)!)) out.push(n.id);
  }
  return out;
}

describe('SA4E-406 corridor invariant after a lane-flow relayout (BR-59/BR-60)', () => {
  const LANES_SKIP = (): string => wrap(
    lane('A', 'Actor A', 13) + lane('B', 'Actor B', 227) + lane('C', 'Actor C', 441)
    + node('a1', 'A', 33, 47) + node('b1', 'B', 33, 47) + node('c1', 'C', 33, 47)
    + edge('f1', 'a1', 'b1') + edge('f2', 'b1', 'c1') + edge('skip', 'a1', 'c1'),
  );

  it('re-plans every edge through the corridors: no edge over unrelated content', async () => {
    const out = await runTool('lanes-skip.drawio', LANES_SKIP());
    const file = path.join(dir, 'lanes-skip.drawio');
    expect(out.status).toBe('fixed');
    expect(detectAllIssues(parseDrawio(file).graph).filter(i => i.severity !== 'low')).toEqual([]);
    expect(detectEdgeWrongParent(parseDrawio(file).graph)).toEqual([]);
    for (const [id, line] of polylinesOf(file)) {
      expect(hitNodes(id, line, file)).toEqual([]); // corridors, not shortcuts
    }
  }, 60_000);

  it('the skip edge detours around the middle lane step (background only)', async () => {
    await runTool('skip.drawio', LANES_SKIP());
    const file = path.join(dir, 'skip.drawio');
    const { graph } = parseDrawio(file);
    const rects = absoluteRects(graph);
    const byId = cellIndex(graph);
    const skip = graph.edges.find(e => e.id === 'skip')!;
    const originOf = (parentId: string): { x: number; y: number } => {
      for (const anc of ancestorsOf(parentId, byId)) {
        const r = rects.get(anc);
        if (r) return { x: r.x, y: r.y };
      }
      return { x: 0, y: 0 };
    };
    const line = edgePolyline(skip, rects, originOf);
    expect(line.length).toBeGreaterThanOrEqual(2);
    expect(polylineHitsRect(line, rects.get('b1')!)).toBe(false);
  }, 60_000);

  it('an unrelated edge-less band never becomes a corridor for lane edges', async () => {
    const xml = wrap(
      lane('A', 'A', 13) + lane('B', 'B', 227)
      + node('a1', 'A', 33, 47) + node('a2', 'A', 193, 47) + node('b1', 'B', 33, 47) + node('b2', 'B', 193, 47)
      + band('U', 'Unrelated', 1200, 13) + node('u1', 'U', 33, 47)
      + edge('f1', 'a1', 'a2') + edge('f2', 'a2', 'b1') + edge('f3', 'b1', 'b2'),
    );
    const out = await runTool('band-shortcut.drawio', xml);
    const file = path.join(dir, 'band-shortcut.drawio');
    expect(['fixed', 'partial']).toContain(out.status);
    expect(detectAllIssues(parseDrawio(file).graph).filter(i => i.severity !== 'low')).toEqual([]);
    const { graph } = parseDrawio(file);
    const rects = absoluteRects(graph);
    for (const line of polylinesOf(file).values()) {
      expect(polylineHitsRect(line, rects.get('u1')!)).toBe(false); // u1 untouched
    }
    expect(detectEdgeWrongParent(graph)).toEqual([]);
  }, 60_000);
});
