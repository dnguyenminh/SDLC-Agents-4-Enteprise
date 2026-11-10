/**
 * SA4E-406 — drawio_auto_layout through the SAME dispatch the MCP server uses for
 * local tools (executeLocalTool → registered handler → PathResolver → engine → file).
 * Sequence fragments, multi-boundary use cases and a plain flow chart, end to end.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeLocalTool, getLocalToolDefinitions } from '../../../backend-local-tools/registry';
import { readCells } from '../drawio-table-cells';

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const vertex = (id: string, style: string, x: number, y: number, w: number, h: number, parent = '1'): string =>
  `<mxCell id="${id}" value="${id}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string, style = 'endArrow=none;html=1;'): string =>
  `<mxCell id="${id}" value="${id}" style="${style}" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

const FRAME = 'shape=umlFrame;whiteSpace=wrap;html=1;pointerEvents=0;';
const LIFELINE = 'shape=umlLifeline;perimeter=lifelinePerimeter;html=1;container=0;collapsible=0;size=40;';
const anchored = (id: string, s: string, t: string, y: number): string => {
  const f = Math.round(((y - 40) / 520) * 10000) / 10000;
  return edge(id, s, t, `html=1;endArrow=block;exitX=0.5;exitY=${f};entryX=0.5;entryY=${f};`);
};
const SEQUENCE = wrap(
  vertex('cl', LIFELINE, 500, 40, 100, 520) + vertex('api', LIFELINE, 40, 40, 100, 520) + vertex('db', LIFELINE, 300, 40, 100, 520)
  + anchored('m1', 'cl', 'api', 140) + anchored('m2', 'api', 'db', 200) + anchored('m3', 'db', 'api', 260) + anchored('m4', 'api', 'cl', 400)
  + vertex('alt', FRAME, 20, 170, 600, 130),
);

const ACTOR = 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;';
const CASE = 'ellipse;whiteSpace=wrap;html=1;';
const USE_CASES = wrap(
  vertex('cust', ACTOR, 700, 20, 30, 60) + vertex('adm', ACTOR, 20, 600, 30, 60)
  + vertex('shop', 'swimlane;startSize=30;html=1;', 100, 300, 300, 200) + vertex('back', 'swimlane;startSize=30;html=1;', 500, 100, 300, 200)
  + [1, 2, 3].map(i => vertex(`s${i}`, CASE, 10 + i * 20, 40 + i * 10, 160, 60, 'shop')).join('')
  + [1, 2].map(i => vertex(`b${i}`, CASE, 10 + i * 5, 40 + i * 70, 170, 60, 'back')).join('')
  + [1, 2, 3].map(i => edge(`ca${i}`, 'cust', `s${i}`)).join('') + edge('ab1', 'adm', 'b1') + edge('ab2', 'adm', 'b2'),
);

// Two boxes on top of each other: an ordinary overlap the generic engine must still repair
const FLOW = wrap(vertex('a', 'rounded=1;html=1;', 100, 100, 120, 60) + vertex('b', 'rounded=1;html=1;', 110, 110, 120, 60)
  + vertex('c', 'rounded=1;html=1;', 400, 100, 120, 60) + edge('e1', 'a', 'c', 'endArrow=block;html=1;'));

let dir = '';
let previousRoots: string | undefined;
const call = async (file: string, extra: Record<string, unknown> = {}): Promise<{ isError: boolean; text: string }> => {
  const res = await executeLocalTool('drawio_auto_layout', { file_path: file, base_dir: dir, ...extra }) as
    { isError: boolean; content: Array<{ type: string; text: string }> };
  return { isError: res.isError, text: res.content[0].text };
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-integration-'));
  previousRoots = process.env['MCP_WORKSPACE_ROOTS'];
  process.env['MCP_WORKSPACE_ROOTS'] = dir; // the per-call base_dir must be on the allowlist
  fs.writeFileSync(path.join(dir, 'seq.drawio'), SEQUENCE);
  fs.writeFileSync(path.join(dir, 'uc.drawio'), USE_CASES);
  fs.writeFileSync(path.join(dir, 'flow.drawio'), FLOW);
});
afterAll(() => {
  if (previousRoots === undefined) delete process.env['MCP_WORKSPACE_ROOTS']; else process.env['MCP_WORKSPACE_ROOTS'] = previousRoots;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('drawio_auto_layout via the local-tool dispatch', () => {
  it('is registered with its schema', () => {
    const def = getLocalToolDefinitions().find(d => d.name === 'drawio_auto_layout');
    expect(def).toBeDefined();
    expect(JSON.stringify(def!.inputSchema)).toContain('file_path');
  });

  it('lays out a sequence diagram with a fragment and reports it', async () => {
    const r = await call('seq.drawio');
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.text)).toMatchObject({ status: 'fixed' });
    expect(JSON.parse(r.text).message).toContain('1 fragment(s)');
    const cells = new Map(readCells(fs.readFileSync(path.join(dir, 'seq.drawio'), 'utf-8')).map(c => [c.id, c]));
    expect(cells.get('alt')!.style).toContain('fillColor=none');
    expect(cells.get('api')!.style).toContain('shape=umlLifeline');
  });

  it('is idempotent on the second call', async () => {
    const before = fs.readFileSync(path.join(dir, 'seq.drawio'), 'utf-8');
    const r = await call('seq.drawio');
    expect(JSON.parse(r.text).status).toBe('already_good');
    expect(fs.readFileSync(path.join(dir, 'seq.drawio'), 'utf-8')).toBe(before);
  });

  it('lays out a multi-boundary use-case diagram', async () => {
    const r = await call('uc.drawio');
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.text)).toMatchObject({ status: 'fixed' });
    expect(JSON.parse(r.text).message).toContain('2 group(s)');
    expect(JSON.parse((await call('uc.drawio')).text).status).toBe('already_good');
  });

  it('still repairs an ordinary overlap with the generic engine', async () => {
    const r = await call('flow.drawio');
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.text).status).toBe('fixed');
    expect(JSON.parse(r.text).message).not.toMatch(/Sequence|Use-case/);
  });

  it('rejects a path outside the allowed workspace and a missing file', async () => {
    expect((await call('../escape.drawio')).isError).toBe(true);
    const missing = await call('nope.drawio');
    expect(missing.isError).toBe(true);
    expect(missing.text).toMatch(/not found/i);
  });
});
