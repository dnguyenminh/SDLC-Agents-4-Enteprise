/**
 * SA4E-406 (F1) — single-pass batch XML cell rewriter (drawio-xml-rewrite).
 *
 * Covers: multiple patches in one pass, untouched cells byte-identical,
 * unknown id tolerated, duplicate id (last wins), cell body replacement,
 * unterminated <mxCell completes without throwing, empty patch map identity,
 * and a scaled timing guard against quadratic regression.
 */
import { describe, it, expect } from 'vitest';
import { rewriteCells, type CellPatch } from '../drawio-xml-rewrite';

const cell = (id: string, x: number, y: number, w: number, h: number): string =>
  `<mxCell id="${id}" vertex="1" parent="1" style="rounded=1;"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;

const openCell = (id: string): string =>
  `<mxCell id="${id}" vertex="1" parent="1" style="rounded=1;">`;

describe('drawio-xml-rewrite', () => {
  it('applies multiple patches in a single pass', () => {
    const xml = `<mxGraphModel><root>${cell('a', 0, 0, 10, 10)}${cell('b', 0, 0, 10, 10)}${cell('c', 0, 0, 10, 10)}</root></mxGraphModel>`;
    const patches = new Map<string, (open: string, body: string) => CellPatch | null>([
      ['a', (_o, b) => ({ open: _o, body: b.replace('x="0"', 'x="100"') })],
      ['b', (_o, b) => ({ open: _o, body: b.replace('y="0"', 'y="200"') })],
    ]);
    const out = rewriteCells(xml, patches);
    // a's geometry body patched (x="100")
    expect(out).toContain('<mxCell id="a" vertex="1" parent="1" style="rounded=1;"><mxGeometry x="100"');
    // b's geometry body patched (y="200")
    expect(out).toContain('<mxCell id="b" vertex="1" parent="1" style="rounded=1;"><mxGeometry x="0" y="200"');
    // c untouched
    expect(out).toContain(`<mxCell id="c" vertex="1" parent="1" style="rounded=1;"><mxGeometry x="0" y="0" width="10" height="10" as="geometry"/></mxCell>`);
  });

  it('leaves untouched cells byte-identical', () => {
    const xml = `<mxGraphModel><root>${cell('a', 1, 2, 3, 4)}${cell('b', 5, 6, 7, 8)}</root></mxGraphModel>`;
    const patches = new Map<string, (open: string, body: string) => CellPatch | null>([
      ['a', (_o, b) => ({ open: _o, body: b.replace('x="1"', 'x="99"') })],
    ]);
    const out = rewriteCells(xml, patches);
    // 'b' must be completely unchanged
    expect(out).toContain(`id="b" vertex="1" parent="1" style="rounded=1;"><mxGeometry x="5" y="6" width="7" height="8" as="geometry"/></mxCell>`);
  });

  it('tolerates unknown ids without throwing or changing anything', () => {
    const xml = `<mxGraphModel><root>${cell('a', 0, 0, 10, 10)}</root></mxGraphModel>`;
    const patches = new Map<string, (open: string, body: string) => CellPatch | null>([
      ['nope', (_o, b) => ({ open: _o, body: b.replace('x="0"', 'x="99"') })],
    ]);
    expect(rewriteCells(xml, patches)).toBe(xml);
  });

  it('duplicate id: last write wins (Map holds one entry per id)', () => {
    const xml = `<mxGraphModel><root>${cell('a', 0, 0, 10, 10)}</root></mxGraphModel>`;
    const patches = new Map<string, (open: string, body: string) => CellPatch | null>([
      ['a', (_o, b) => ({ open: _o, body: b.replace('x="0"', 'x="1"') })],
      ['a', (_o, b) => ({ open: _o, body: b.replace('x="0"', 'x="2"') })],
    ]);
    const out = rewriteCells(xml, patches);
    // last write wins: x="2", not x="1"
    expect(out).toContain('<mxCell id="a" vertex="1" parent="1" style="rounded=1;"><mxGeometry x="2"');
  });

  it('replaces the cell body', () => {
    const xml = `<mxGraphModel><root>${cell('a', 0, 0, 10, 10)}</root></mxGraphModel>`;
    const patches = new Map<string, (open: string, body: string) => CellPatch | null>([
      ['a', (_o, _b) => ({ open: _o, body: '<mxGeometry x="5" y="5" width="9" height="9" as="geometry"/>' })],
    ]);
    const out = rewriteCells(xml, patches);
    expect(out).toContain('x="5" y="5" width="9" height="9"');
    expect(out).not.toContain('x="0"');
  });

  it('skips self-closing cells (no body, patch not applied)', () => {
    const xml = '<mxGraphModel><root><mxCell id="a" vertex="1" parent="1"/></root></mxGraphModel>';
    const patches = new Map<string, (open: string, body: string) => CellPatch | null>([
      ['a', (_o, _b) => ({ open: _o, body: 'replaced' })],
    ]);
    expect(rewriteCells(xml, patches)).toBe(xml);
  });

  it('completes fast without throwing on unterminated <mxCell input', () => {
    const started = Date.now();
    const cells = Array.from({ length: 2000 }, (_, i) => cell(`n${i}`, 0, 0, 10, 10)).join('');
    const xml = `<mxGraphModel><root>${cells}<mxCell id="broken" value="unterminated`;
    const patches = new Map<string, (open: string, body: string) => CellPatch | null>([
      ['n100', (_o, b) => ({ open: _o, body: b.replace('x="0"', 'x="99"') })],
    ]);
    const out = rewriteCells(xml, patches);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(2000);
    // n100's geometry body patched
    expect(out).toContain('<mxCell id="n100"');
    expect(out.match(/id="n100"[^>]*><mxGeometry x="99"/)).toHaveLength(1);
    // unterminated cell copied verbatim
    expect(out).toContain('<mxCell id="broken" value="unterminated');
  });

  it('empty patch map returns the identical string', () => {
    const xml = `<mxGraphModel><root>${cell('a', 0, 0, 10, 10)}</root></mxGraphModel>`;
    expect(rewriteCells(xml, new Map())).toBe(xml);
  });

  it('scaled timing guard: 2000-cell table completes well under 2 s', () => {
    const cells = Array.from({ length: 2000 }, (_, i) =>
      `<mxCell id="t${i}" vertex="1" parent="1" style="tableCell;"><mxGeometry x="${i * 110}" y="0" width="100" height="40" as="geometry"/></mxCell>`,
    ).join('');
    const xml = `<mxGraphModel><root>${cells}</root></mxGraphModel>`;
    const patches = new Map<string, (open: string, body: string) => CellPatch | null>();
    for (let i = 0; i < 2000; i++) {
      patches.set(`t${i}`, (_o, b) => ({ open: _o, body: b.replace('width="100"', 'width="120"') }));
    }
    const started = Date.now();
    const out = rewriteCells(xml, patches);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(2000);
    expect(out).toContain('width="120"');
    // every cell patched
    const matches = out.match(/width="120"/g);
    expect(matches).toHaveLength(2000);
  });
});
