/**
 * SA4E-406 — class/ER style diagrams: swimlane "class" boxes whose children
 * are label rows, edges between the BOXES (incl. recursive self-references),
 * generic types in html=1 labels.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseDrawio } from '../drawio-parser';
import { detectAllIssues } from '../drawio-detect';
import { handleApply } from '../drawio-apply';
import { findMalformedTags, sanitizeDrawioXml } from '../drawio-xml-sanitize';
import { detectLanes } from '../drawio-humanize-lanes';
import { absoluteRects } from '../drawio-geometry';

const klass = (id: string, title: string, x: number) =>
  `<mxCell id="${id}" value="${title}" style="swimlane;fontStyle=1;childLayout=stackLayout;horizontal=0;startSize=26;horizontalStack=0;resizeParent=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="200" height="100" as="geometry"/></mxCell>`;
const row = (id: string, parent: string, text: string, y: number) =>
  `<mxCell id="${id}" value="${text}" style="text;html=1;align=left;" vertex="1" parent="${parent}"><mxGeometry x="900" y="${y}" width="180" height="30" as="geometry"/></mxCell>`;
const rel = (id: string, s: string, t: string, extra = '') =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;dashed=1;" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry">${extra}</mxGeometry></mxCell>`;

const CLASSES = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
${klass('A', 'Alpha', 0)}${klass('B', 'Beta', 300)}${klass('C', 'Gamma', 600)}
${row('a1', 'A', '+ id: string', 5)}${row('a2', 'A', '+ opts: Map<string, Point>', 5)}${row('a3', 'A', '+ n: number', 5)}
${row('b1', 'B', '+ id: string', 5)}${row('b2', 'B', '+ list: Record<string,string|number>', 5)}
${row('c1', 'C', '+ id: string', 5)}${row('c2', 'C', '+ gap < 40px', 5)}
${rel('r1', 'A', 'B')}${rel('r2', 'B', 'C')}${rel('self', 'B', 'B', '<Array as="points"><mxPoint x="22590.9" y="696"/><mxPoint x="22590.9" y="726"/></Array>')}
</root></mxGraphModel>`;

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

async function layout(xml: string): Promise<{ file: string; text: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dio-class-'));
  dirs.push(dir);
  const file = path.join(dir, 'd.drawio');
  fs.writeFileSync(file, sanitizeDrawioXml(xml).xml, 'utf-8');
  const { raw, graph } = parseDrawio(file);
  await handleApply(raw, graph, detectAllIssues(graph), graph.nodes.length + graph.containers.length, {}, file);
  return { file, text: fs.readFileSync(file, 'utf-8') };
}

describe('JSON-style \\" in attribute values', () => {
  const BROKEN = '<mxCell id="a" value="Run: \\"tool.exe\\" --out \\"o.png\\"&#xa;done" style="html=1;" vertex="1" parent="1"/>';

  it('is repaired to &quot; and the result is well-formed', () => {
    const { xml, fixes } = sanitizeDrawioXml(BROKEN);
    expect(fixes.join()).toContain('&quot;');
    expect(xml).toContain('value="Run: &quot;tool.exe&quot; --out &quot;o.png&quot;&#xa;done"');
    expect(findMalformedTags(xml)).toEqual([]);
  });

  it('keeps a genuine trailing backslash before the closing quote', () => {
    const ok = '<mxCell id="a" value="C:\\dir\\" style="html=1;" vertex="1" parent="1"/>';
    expect(sanitizeDrawioXml(ok).xml).toBe(ok);
  });

  it('reports tags that cannot be repaired instead of letting them be skipped silently', () => {
    const bad = '<root>\n<mxCell id="a" value="x" style=html=1 vertex="1"/>\n</root>';
    const found = findMalformedTags(bad);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
    expect(found[0].tag).toBe('mxCell');
  });
});

describe('edge style', () => {
  it('forces orthogonalEdgeStyle so draw.io honours the planned waypoints', async () => {
    const withEr = CLASSES.replace(/style="edgeStyle=orthogonalEdgeStyle;dashed=1;"/g, 'style="edgeStyle=entityRelationEdgeStyle;curved=1;endArrow=ERoneToMany;"');
    const { text } = await layout(withEr);
    const styles = [...text.matchAll(/<mxCell id="(?:r1|r2|self)"[^>]*?style="([^"]*)"/g)].map(m => m[1]);
    expect(styles).toHaveLength(3);
    for (const s of styles) {
      expect(s).toContain('edgeStyle=orthogonalEdgeStyle');
      expect(s).not.toContain('entityRelationEdgeStyle');
      expect(s).toContain('curved=0');
      expect(s).toContain('endArrow=ERoneToMany'); // author's arrowheads are kept
    }
  }, 60_000);
});

describe('lane layout keeps room for edges', () => {
  it('routes every edge on the grid (no straight-through fallback) when steps share a lane', async () => {
    const lanes = ['A', 'B'].map((id, i) =>
      `<mxCell id="${id}" value="${id}" style="swimlane;horizontal=0;startSize=30;" vertex="1" parent="1"><mxGeometry x="0" y="${i * 100}" width="200" height="100" as="geometry"/></mxCell>`).join('');
    const step = (id: string, p: string) =>
      `<mxCell id="${id}" value="${id}" style="rounded=1;" vertex="1" parent="${p}"><mxGeometry x="5" y="5" width="120" height="50" as="geometry"/></mxCell>`;
    const e = (id: string, s: string, t: string) =>
      `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
    // s1 feeds two steps of lane B that end up stacked in the same flow column
    const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${lanes}
${step('s1', 'A')}${step('t1', 'B')}${step('t2', 'B')}${step('t3', 'B')}
${e('e1', 's1', 't1')}${e('e2', 's1', 't2')}${e('e3', 's1', 't3')}</root></mxGraphModel>`;
    const { file } = await layout(xml);
    const issues = detectAllIssues(parseDrawio(file).graph);
    expect(issues.filter(i => i.type === 'edge_crossing')).toEqual([]);
  }, 60_000);
});

describe('a second pass never makes a laid-out diagram worse', () => {
  it('keeps the blocking issue count from growing when the tool is run again', async () => {
    const { file } = await layout(CLASSES);
    const blocking = (): number => detectAllIssues(parseDrawio(file).graph).filter(i => i.severity !== 'low').length;
    const first = blocking();
    const { raw, graph } = parseDrawio(file);
    await handleApply(raw, graph, detectAllIssues(graph), graph.nodes.length + graph.containers.length, {}, file);
    expect(blocking()).toBeLessThanOrEqual(first);
  }, 60_000);
});

describe('class diagram', () => {
  it('is not mistaken for a swimlane flow (edges join the boxes, not steps inside them)', () => {
    const { graph } = parseDrawio((() => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dio-class-'));
      dirs.push(dir);
      const f = path.join(dir, 'd.drawio');
      fs.writeFileSync(f, sanitizeDrawioXml(CLASSES).xml, 'utf-8');
      return f;
    })());
    expect(detectLanes(graph, { algorithm: 'layered', spacing: 80, direction: 'DOWN', scope: 'auto', relayout: false })).toBeNull();
  });

  it('stacks attribute rows top-to-bottom, flush, inside their box', async () => {
    const { file } = await layout(CLASSES);
    const rects = absoluteRects(parseDrawio(file).graph);
    const rows = ['a1', 'a2', 'a3'].map(id => rects.get(id)!);
    expect(rows[1].y).toBe(rows[0].y + rows[0].h);
    expect(rows[2].y).toBe(rows[1].y + rows[1].h);
    expect(new Set(rows.map(r => r.x)).size).toBe(1);
    const box = rects.get('A')!;
    expect(rows[0].x).toBeGreaterThanOrEqual(box.x + 26); // clear of the left title strip
    expect(rows[2].y + rows[2].h).toBeLessThanOrEqual(box.y + box.h);
  }, 60_000);

  it('draws a self-reference as a local loop instead of keeping stale far-away waypoints', async () => {
    const { file, text } = await layout(CLASSES);
    expect(text).not.toContain('22590.9');
    const rects = absoluteRects(parseDrawio(file).graph);
    const b = rects.get('B')!;
    const m = /id="self"[^>]*>[\s\S]*?<\/mxCell>/.exec(text)![0];
    const xs = [...m.matchAll(/<mxPoint x="([\d.]+)"/g)].map(x => Number(x[1]));
    expect(xs.length).toBe(2);
    for (const x of xs) { expect(x).toBeGreaterThan(b.x + b.w); expect(x).toBeLessThan(b.x + b.w + 100); }
  }, 60_000);

  it('keeps generic types visible: html=1 labels are double-escaped', async () => {
    const { text } = await layout(CLASSES);
    expect(text).toContain('Map&amp;lt;string, Point&amp;gt;');
    expect(text).toContain('Record&amp;lt;string,string|number&amp;gt;');
    expect(text).toContain('gap &amp;lt; 40px');
  }, 60_000);

  it('leaves no blocking issues and ignores flush table rows for proximity', async () => {
    const { file } = await layout(CLASSES);
    const issues = detectAllIssues(parseDrawio(file).graph);
    expect(issues.filter(i => i.severity !== 'low')).toEqual([]);
    expect(issues.filter(i => i.type === 'node_proximity')).toEqual([]);
  }, 60_000);
});
