/**
 * SA4E-406 F4 — drawio handlers honour the bound session root.
 * A drawio_auto_layout call with ctx.sessionRoot resolves file_path under
 * that root (not legacy folders[0]/base_dir semantics).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeLocalTool } from '../../../backend-local-tools/registry';

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const node = (id: string, x: number, y: number): string =>
  `<mxCell id="${id}" value="${id}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string): string =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
const BUNCH = wrap(node('a', 100, 100) + node('b', 110, 110) + edge('e', 'a', 'b'));

describe('SA4E-406 F4 — drawio call honours the bound session root', () => {
  let sessionRoot = '';
  let savedRoots: string | undefined;
  let savedParents: string | undefined;
  beforeAll(() => {
    sessionRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'f4-session-')));
    savedRoots = process.env['MCP_WORKSPACE_ROOTS'];
    savedParents = process.env['MCP_WORKSPACE_ROOT_PARENTS'];
    process.env['MCP_WORKSPACE_ROOTS'] = ''; // no allowlist — session root is the gate
    process.env['MCP_WORKSPACE_ROOT_PARENTS'] = '';
  });
  afterAll(() => {
    if (savedRoots === undefined) delete process.env['MCP_WORKSPACE_ROOTS']; else process.env['MCP_WORKSPACE_ROOTS'] = savedRoots;
    if (savedParents === undefined) delete process.env['MCP_WORKSPACE_ROOT_PARENTS']; else process.env['MCP_WORKSPACE_ROOT_PARENTS'] = savedParents;
    fs.rmSync(sessionRoot, { recursive: true, force: true });
  });

  it('resolves and fixes a file under the bound session root (root_source session)', async () => {
    fs.writeFileSync(path.join(sessionRoot, 'session-file.drawio'), BUNCH, 'utf-8');
    const res = await executeLocalTool('drawio_auto_layout',
      { file_path: 'session-file.drawio' },
      { sessionRoot }) as
      { isError: boolean; content: Array<{ type: string; text: string }> };
    expect(res.isError).toBe(false);
    const out = JSON.parse(res.content[0].text);
    expect(out.status).toBe('fixed');
    // The file really was resolved under the session root and rewritten.
    const text = fs.readFileSync(path.join(sessionRoot, 'session-file.drawio'), 'utf-8');
    expect(text).not.toBe(BUNCH);
  }, 60_000);
});
