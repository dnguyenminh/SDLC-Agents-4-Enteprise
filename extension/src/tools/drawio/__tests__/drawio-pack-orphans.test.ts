/**
 * SA4E-406 — flow-ordered shelf packing of bands and shelving of edge-less nodes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { packShelves } from '../drawio-humanize-pack';
import { parseDrawio } from '../drawio-parser';
import { detectAllIssues } from '../drawio-detect';
import { handleApply } from '../drawio-apply';
import { absoluteRects } from '../drawio-geometry';

describe('packShelves', () => {
  const item = (id: string, width: number, height: number) => ({ id, width, height });

  it('puts narrow bands side by side under a wide band, keeping flow order', () => {
    const p = packShelves([item('top', 200, 100), item('wide', 1000, 300), item('a', 400, 200), item('b', 400, 150)], 1000);
    const at = (id: string) => p.find(x => x.id === id)!;
    expect(at('top').y).toBeLessThan(at('wide').y);
    expect(at('wide').y).toBeLessThan(at('a').y);
    expect(at('a').y).toBe(at('b').y);          // same shelf
    expect(at('a').x).toBeLessThan(at('b').x);  // declared order left→right
  });

  it('wraps to a new shelf when the next item would overflow', () => {
    const p = packShelves([item('a', 600, 100), item('b', 600, 100)], 700);
    expect(p[1].y).toBeGreaterThan(p[0].y);
    expect(p[1].x).toBe(p[0].x);
  });
});

const box = (id: string, y: number) =>
  `<mxCell id="${id}" value="${id}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="0" y="${y}" width="120" height="50" as="geometry"/></mxCell>`;
const link = (id: string, s: string, t: string) =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const chain = (n: number): string => {
  const cells = Array.from({ length: n }, (_, i) => box(`s${i + 1}`, i * 120)).join('');
  const edges = Array.from({ length: n - 1 }, (_, i) => link(`e${i + 1}`, `s${i + 1}`, `s${i + 2}`)).join('');
  return `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}${edges}</root></mxGraphModel>`;
};

async function layoutFile(xml: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dio-chain-'));
  dirs.push(dir);
  const file = path.join(dir, 'd.drawio');
  fs.writeFileSync(file, xml, 'utf-8');
  const { raw, graph } = parseDrawio(file);
  await handleApply(raw, graph, detectAllIssues(graph), graph.nodes.length, {}, file);
  return file;
}

describe('extreme aspect ratio', () => {
  it('flags a long chain drawn as one strip, but not short ones or banded diagrams', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dio-chain-'));
    dirs.push(dir);
    const strip = path.join(dir, 'strip.drawio');
    fs.writeFileSync(strip, chain(20), 'utf-8');
    const hit = detectAllIssues(parseDrawio(strip).graph).filter(i => i.type === 'extreme_aspect_ratio');
    expect(hit).toHaveLength(1);
    const short = path.join(dir, 'short.drawio');
    fs.writeFileSync(short, chain(5), 'utf-8');
    expect(detectAllIssues(parseDrawio(short).graph).filter(i => i.type === 'extreme_aspect_ratio')).toEqual([]);
  });

  it('wraps a 20-step chain into several columns with a landscape shape and clean edges', async () => {
    const file = await layoutFile(chain(20));
    const { graph } = parseDrawio(file);
    const rects = absoluteRects(graph);
    const xs = new Set(graph.nodes.map(n => Math.round(rects.get(n.id)!.x)));
    expect(xs.size).toBeGreaterThan(1);
    const all = graph.nodes.map(n => rects.get(n.id)!);
    const w = Math.max(...all.map(r => r.x + r.w)) - Math.min(...all.map(r => r.x));
    const h = Math.max(...all.map(r => r.y + r.h)) - Math.min(...all.map(r => r.y));
    expect(w / h).toBeLessThan(4);
    expect(w / h).toBeGreaterThan(0.25);
    expect(detectAllIssues(graph).filter(i => i.severity !== 'low')).toEqual([]);
  }, 60_000);

  it('leaves a short chain as a single flow (no wrapping)', async () => {
    const { graph } = parseDrawio(await layoutFile(chain(6)));
    const rects = absoluteRects(graph);
    expect(new Set(graph.nodes.map(n => Math.round(rects.get(n.id)!.x))).size).toBe(1);
  }, 60_000);
});

describe('orphans', () => {
  it('lays the real flow out alone and shelves edge-less nodes below it', async () => {
    const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
${box('a', 0)}${box('b', 0)}${box('c', 0)}${box('lonely1', 0)}${box('lonely2', 0)}
${link('e1', 'a', 'b')}${link('e2', 'b', 'c')}</root></mxGraphModel>`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dio-orphan-'));
    dirs.push(dir);
    const file = path.join(dir, 'd.drawio');
    fs.writeFileSync(file, xml, 'utf-8');
    const { raw, graph } = parseDrawio(file);
    await handleApply(raw, graph, detectAllIssues(graph), graph.nodes.length, {}, file);

    const rects = absoluteRects(parseDrawio(file).graph);
    const flowBottom = Math.max(...['a', 'b', 'c'].map(id => rects.get(id)!.y + rects.get(id)!.h));
    for (const id of ['lonely1', 'lonely2']) expect(rects.get(id)!.y).toBeGreaterThan(flowBottom);
    // the chain keeps its own order undisturbed by the orphans
    expect(rects.get('a')!.y).toBeLessThan(rects.get('b')!.y);
    expect(rects.get('b')!.y).toBeLessThan(rects.get('c')!.y);
    expect(detectAllIssues(parseDrawio(file).graph).filter(i => i.severity !== 'low')).toEqual([]);
  }, 60_000);
});
