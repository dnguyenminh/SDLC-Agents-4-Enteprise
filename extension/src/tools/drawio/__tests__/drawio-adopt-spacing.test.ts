/**
 * SA4E-406 — regressions found on the SA4E-394 diagrams:
 *  1. boxes drawn over an empty band must become its children (adoptVisualChildren);
 *  2. nodes without edges between them were spaced by ELK's 20 px component gap, which left
 *     the router no corridor (every edge between such rows fell back to a straight line);
 *  3. the stub an edge leaves a port with must fit the gap ahead of it.
 */
import { describe, it, expect } from 'vitest';
import { adoptVisualChildren } from '../drawio-adopt-children';
import { flatPositions } from '../drawio-humanize-elk';
import { planEdges } from '../drawio-edge-plan';
import { stubLength } from '../drawio-edge-stub';
import { parseDrawioXml } from '../drawio-parser';
import { readCells } from '../drawio-table-cells';

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const vertex = (id: string, style: string, x: number, y: number, w: number, h: number, parent = '1'): string =>
  `<mxCell id="${id}" value="${id}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string): string =>
  `<mxCell id="${id}" style="endArrow=block;html=1;" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
const BAND = 'rounded=0;whiteSpace=wrap;html=1;fillColor=none;dashed=1;strokeColor=#6c8ebf;';
const BOX = 'rounded=1;html=1;';

describe('adoptVisualChildren', () => {
  const xml = wrap(
    vertex('band', BAND, 100, 100, 400, 300) + vertex('in1', BOX, 140, 160, 120, 60) + vertex('in2', BOX, 300, 260, 120, 60)
    + vertex('out', BOX, 600, 160, 120, 60) + vertex('full', BAND, 700, 100, 300, 200) + vertex('kid', BOX, 10, 40, 100, 50, 'full'),
  );

  it('makes boxes inside an empty band its children, with container-relative geometry', () => {
    const { xml: out, adopted } = adoptVisualChildren(xml);
    const cells = new Map(readCells(out).map(c => [c.id, c]));
    expect(adopted.get('band')).toEqual(['in1', 'in2']);
    expect(cells.get('in1')!.parent).toBe('band');
    expect(cells.get('in1')!.geo).toMatchObject({ x: 40, y: 60 });
    expect(cells.get('in2')!.geo).toMatchObject({ x: 200, y: 160 });
  });

  it('leaves boxes outside the band and bands that already have children alone', () => {
    const cells = new Map(readCells(adoptVisualChildren(xml).xml).map(c => [c.id, c]));
    expect(cells.get('out')!.parent).toBe('1');
    expect(cells.get('out')!.geo).toMatchObject({ x: 600, y: 160 });
    expect(cells.get('kid')!.parent).toBe('full');
  });

  it('is idempotent', () => {
    const once = adoptVisualChildren(xml).xml;
    const again = adoptVisualChildren(once);
    expect(again.adopted.size).toBe(0);
    expect(again.xml).toBe(once);
  });

  it('gives the smallest of two nested bands the box', () => {
    const nested = wrap(vertex('outer', BAND, 0, 0, 600, 400) + vertex('inner', BAND, 50, 50, 300, 200) + vertex('b', BOX, 100, 100, 80, 40));
    const out = adoptVisualChildren(nested).adopted;
    expect(out.get('inner')).toEqual(['b']);
    expect(out.has('outer')).toBe(false);
  });
});

describe('spacing of nodes that have no edge between them', () => {
  it('uses the node spacing, not ELK\'s 20 px component default', async () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, width: 200, height: 70 }));
    const pos = await flatPositions(items, [], { dir: 'RIGHT', algorithm: 'layered', timeoutMs: 30_000, wrap: true, nodeSpacing: 56, layerSpacing: 100 });
    const rects = items.map(i => ({ ...pos.get(i.id)!, w: i.width, h: i.height }));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const gapX = Math.max(rects[j].x - (rects[i].x + rects[i].w), rects[i].x - (rects[j].x + rects[j].w));
        const gapY = Math.max(rects[j].y - (rects[i].y + rects[i].h), rects[i].y - (rects[j].y + rects[j].h));
        expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(56);
      }
    }
  });
});

describe('stub length', () => {
  const self = { x: 100, y: 200, w: 100, h: 50 };
  it('is the full 20 px with room ahead and shrinks into a tight gap', () => {
    expect(stubLength({ x: 150, y: 200 }, 3, self, [self])).toBe(20);
    const above = { x: 100, y: 126, w: 100, h: 50 }; // 24 px gap above `self`
    expect(stubLength({ x: 150, y: 200 }, 3, self, [self, above])).toBe(12);
  });

  it('ignores obstacles that are not in line with the port', () => {
    const aside = { x: 400, y: 150, w: 100, h: 50 };
    expect(stubLength({ x: 150, y: 200 }, 3, self, [self, aside])).toBe(20);
  });
});

describe('routing between rows with a tight gap', () => {
  it('finds a grid route (no straight-line fallback) when the gap is wide enough for a corridor', () => {
    const xml = wrap(
      vertex('top', BOX, 400, 40, 160, 60) + vertex('l1', BOX, 40, 300, 160, 60) + vertex('l2', BOX, 40, 396, 160, 60)
      + vertex('r1', BOX, 260, 300, 160, 60) + edge('e', 'l2', 'top'),
    );
    const plans = planEdges(parseDrawioXml(xml));
    expect(plans.find(p => p.id === 'e')!.fallback).toBe(false);
  });
});
