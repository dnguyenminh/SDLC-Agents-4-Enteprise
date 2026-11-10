/**
 * SA4E-406 — table repair (geometry, foreign-shape lift, mixed-column split,
 * startSize pinning), sequence-diagram detection, and the router's
 * "touching another edge's corner" cost.
 */
import { describe, it, expect } from 'vitest';
import { repairTables } from '../drawio-table-repair';
import { readCells, type TCell } from '../drawio-table-cells';
import { detectSequenceDiagram } from '../drawio-detect-sequence';
import { parseDrawioXml } from '../drawio-parser';
import { GridRouter } from '../drawio-grid-router';

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const geo = (x: number, y: number, w: number, h: number): string =>
  `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>`;
const table = (id: string, value: string, g: string): string =>
  `<mxCell id="${id}" value="${value}" style="shape=table;html=1;" vertex="1" parent="1">${g}</mxCell>`;
const row = (id: string, parent: string, g: string): string =>
  `<mxCell id="${id}" value="" style="shape=tableRow;html=1;" vertex="1" parent="${parent}">${g}</mxCell>`;
const cell = (id: string, parent: string, g: string): string =>
  `<mxCell id="${id}" value="${id}" style="shape=tableCell;html=1;" vertex="1" parent="${parent}">${g}</mxCell>`;
const byId = (xml: string): Map<string, TCell> => new Map(readCells(xml).map(c => [c.id, c]));

/** Table whose rows were scattered by a generic layout pass (x=1313, y=40 …). */
const SCATTERED = wrap(
  table('t', 'Title', geo(10, 20, 9000, 400))
  + row('r1', 't', geo(1313, 40, 0, 50)) + cell('a', 'r1', geo(400, 40, 100, 50)) + cell('b', 'r1', geo(900, 0, 120, 50))
  + row('r2', 't', geo(6486, 40, 0, 50)) + cell('c', 'r2', geo(0, 0, 100, 50)) + cell('d', 'r2', geo(100, 0, 100, 50)),
);

describe('repairTables', () => {
  it('restores rows stacked under the title and cells side by side with uniform columns', () => {
    const c = byId(repairTables(SCATTERED).xml);
    expect(c.get('r1')!.geo).toEqual({ x: 0, y: 30, width: 220, height: 50 });
    expect(c.get('r2')!.geo).toEqual({ x: 0, y: 80, width: 220, height: 50 });
    // column 2 takes the widest cell of that column (120) in every row
    expect(c.get('b')!.geo).toEqual({ x: 100, y: 0, width: 120, height: 50 });
    expect(c.get('d')!.geo).toEqual({ x: 100, y: 0, width: 120, height: 50 });
    expect(c.get('t')!.geo).toMatchObject({ x: 10, y: 20, width: 220, height: 130 });
  });

  it('pins startSize on table and rows so draw.io grid lines end at the table border', () => {
    const c = byId(repairTables(SCATTERED).xml);
    expect(c.get('t')!.style).toContain('startSize=30;');
    expect(c.get('r1')!.style).toContain('startSize=0;');
  });

  it('is idempotent: a repaired table comes back unchanged', () => {
    const once = repairTables(SCATTERED).xml;
    const twice = repairTables(once);
    expect(twice.repaired).toBe(0);
    expect(twice.xml).toBe(once);
  });

  it('lifts foreign shapes off a row with absolute coordinates and drops the emptied row', () => {
    const xml = wrap(
      table('t', '', geo(100, 200, 200, 40))
      + row('r1', 't', geo(0, 0, 200, 40)) + cell('a', 'r1', geo(0, 0, 200, 40))
      + row('canvas', 't', geo(0, 40, 200, 300))
      + '<mxCell id="box" value="Decision" style="rhombus;" vertex="1" parent="canvas">' + geo(20, 30, 80, 40) + '</mxCell>',
    );
    const c = byId(repairTables(xml).xml);
    expect(c.has('canvas')).toBe(false);
    expect(c.get('box')!.parent).toBe('1');
    expect(c.get('box')!.geo).toEqual({ x: 120, y: 270, width: 80, height: 40 });
    expect(c.get('t')!.geo).toMatchObject({ width: 200, height: 40 });
  });

  it('splits a table whose rows have different column counts into stacked tables', () => {
    const xml = wrap(
      table('t', 'Main', geo(0, 0, 300, 130))
      + row('r1', 't', geo(0, 30, 300, 50)) + ['a', 'b', 'c'].map((id, i) => cell(id, 'r1', geo(i * 100, 0, 100, 50))).join('')
      + row('r2', 't', geo(0, 80, 300, 50)) + cell('d', 'r2', geo(0, 0, 150, 50)) + cell('e', 'r2', geo(150, 0, 150, 50)),
    );
    const out = repairTables(xml).xml;
    const c = byId(out);
    const part = c.get('t-part1')!;
    expect(part.style).toMatch(/shape=table/);
    expect(part.value).toBe('');
    expect(c.get('r2')!.parent).toBe('t-part1');
    expect(c.get('t')!.geo).toMatchObject({ height: 80 });
    // second part starts below the first (80 high + 20 gap) and has no title band
    expect(part.geo).toMatchObject({ x: 0, y: 100, width: 300, height: 50 });
    expect(c.get('r2')!.geo).toMatchObject({ y: 0 });
    expect(part.style).toContain('startSize=0;');
    // the new table is declared before its rows
    expect(out.indexOf('id="t-part1"')).toBeLessThan(out.indexOf('id="r2"'));
    expect(repairTables(out).repaired).toBe(0);
  });
});

describe('table internals in the parser', () => {
  it('treats the table root as one leaf node and hides rows/cells', () => {
    const graph = parseDrawioXml(repairTables(SCATTERED).xml);
    expect(graph.nodes.map(n => n.id)).toEqual(['t']);
    expect(graph.containers).toHaveLength(0);
  });
});

describe('detectSequenceDiagram', () => {
  const box = (id: string, x: number): string =>
    `<mxCell id="${id}" value="${id}" style="rounded=1;" vertex="1" parent="1">${geo(x, 0, 100, 40)}</mxCell>`;
  const msg = (id: string, s: string, t: string): string =>
    `<mxCell id="${id}" value="${id}" style="endArrow=block;" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

  it('flags participants exchanging many repeated messages', () => {
    const pairs: Array<[string, string]> = [['A', 'B'], ['B', 'C'], ['C', 'B'], ['B', 'A'], ['A', 'B'], ['B', 'C'], ['C', 'B'], ['B', 'A'], ['A', 'C']];
    const xml = wrap(box('A', 0) + box('B', 250) + box('C', 500) + pairs.map(([s, t], i) => msg(`m${i}`, s, t)).join(''));
    const v = detectSequenceDiagram(parseDrawioXml(xml));
    expect(v).toMatchObject({ isSequence: true, participants: 3, messages: 9 });
  });

  it('does not flag an ordinary flow chart', () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const xml = wrap(ids.map((id, i) => box(id, i * 150)).join('')
      + ids.slice(1).map((id, i) => msg(`m${i}`, ids[i], id)).join(''));
    expect(detectSequenceDiagram(parseDrawioXml(xml)).isSequence).toBe(false);
  });
});

describe('GridRouter corner touch', () => {
  it('keeps a later edge off another edge\'s corner instead of forming a T junction', () => {
    const a0 = { x: 0, y: 100 }, a1 = { x: 200, y: 300 };
    const b0 = { x: 200, y: 0 }, b1 = { x: 400, y: 100 };
    const router = new GridRouter([], [a0, a1, b0, b1]);
    const first = router.route({ start: a0, end: a1, startDir: 0, endDir: 3 })!;
    expect(first).toContainEqual({ x: 200, y: 100 }); // its corner
    const second = router.route({ start: b0, end: b1, startDir: 1, endDir: 2 })!;
    expect(second).not.toContainEqual({ x: 200, y: 100 });
    expect(second.some(p => p.x === 200 && p.y === 100)).toBe(false);
  });
});
