/**
 * SA4E-406 — architecture layers (title-on-top swimlanes drawn one above the
 * other, with edges between tiers) must stay stacked: they are layer bands,
 * not actor lanes, and must not be rotated into side-by-side columns.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseDrawio } from '../drawio-parser';
import { detectAllIssues } from '../drawio-detect';
import { handleApply } from '../drawio-apply';
import { sanitizeDrawioXml } from '../drawio-xml-sanitize';
import { absoluteRects } from '../drawio-geometry';
import { detectArrangement } from '../drawio-arrangement';
import { detectLanes } from '../drawio-humanize-lanes';
import { normalizeLayoutArgs } from '../drawio-apply-args';

const layer = (id: string, y: number, h: number) =>
  `<mxCell id="${id}" value="${id}" style="swimlane;startSize=40;" vertex="1" parent="1"><mxGeometry x="20" y="${y}" width="1560" height="${h}" as="geometry"/></mxCell>`;
// Children authored in PAGE coordinates (a common LLM mistake) → child_outside_container
const box = (id: string, parent: string, x: number, y: number) =>
  `<mxCell id="${id}" value="${id}" style="rounded=1;" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="460" height="80" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string) =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

const LAYERS = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
${layer('ux', 20, 400)}${layer('engine', 440, 380)}${layer('storage', 840, 300)}
${box('u1', 'ux', 30, 60)}${box('u2', 'ux', 30, 160)}${box('u3', 'ux', 520, 60)}
${box('g1', 'engine', 30, 480)}${box('g2', 'engine', 30, 620)}${box('g3', 'engine', 820, 480)}
${box('s1', 'storage', 30, 880)}${box('s2', 'storage', 820, 880)}
${edge('e1', 'u1', 'u2')}${edge('e2', 'u2', 'g1')}${edge('e3', 'u2', 'g2')}${edge('e4', 'g3', 's1')}
${edge('e5', 'g1', 's1')}${edge('e6', 'u3', 's2')}${edge('e7', 's1', 's2')}
</root></mxGraphModel>`;

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

function write(xml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dio-layers-'));
  dirs.push(dir);
  const file = path.join(dir, 'd.drawio');
  fs.writeFileSync(file, sanitizeDrawioXml(xml).xml, 'utf-8');
  return file;
}

describe('detectArrangement', () => {
  const b = (id: string, x: number, y: number) => ({ id, x, y, width: 100, height: 50 });
  it('recognises a stacked column and a side-by-side row', () => {
    expect(detectArrangement([b('a', 0, 0), b('b', 0, 60), b('c', 10, 120)])).toBe('column');
    expect(detectArrangement([b('a', 0, 0), b('b', 110, 0), b('c', 220, 5)])).toBe('row');
  });
  it('returns null for a grid or a single box', () => {
    expect(detectArrangement([b('a', 0, 0), b('b', 200, 0), b('c', 0, 100), b('d', 200, 100)])).toBeNull();
    expect(detectArrangement([b('a', 0, 0)])).toBeNull();
  });
});

describe('stacked architecture layers', () => {
  it('are not classified as an actor-lane flow', () => {
    const { graph } = parseDrawio(write(LAYERS));
    expect(detectLanes(graph, normalizeLayoutArgs({}))).toBeNull();
  });

  it('stay stacked top→bottom in the original order, aligned, children inside', async () => {
    const file = write(LAYERS);
    const { raw, graph } = parseDrawio(file);
    await handleApply(raw, graph, detectAllIssues(graph), graph.nodes.length + graph.containers.length, {}, file);
    const after = parseDrawio(file).graph;
    const r = absoluteRects(after);
    const [ux, engine, storage] = ['ux', 'engine', 'storage'].map(id => r.get(id)!);
    expect(ux.y + ux.h).toBeLessThanOrEqual(engine.y);
    expect(engine.y + engine.h).toBeLessThanOrEqual(storage.y);
    expect(new Set([ux.x, engine.x, storage.x]).size).toBe(1);
    expect(new Set([ux.w, engine.w, storage.w]).size).toBe(1);
    expect(detectAllIssues(after).filter(i => i.type === 'child_outside_container')).toEqual([]);
  }, 60_000);
});
