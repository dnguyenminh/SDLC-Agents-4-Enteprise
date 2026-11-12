/**
 * SA4E-406 — session-root binding integration for a REAL drawio tool call
 * (BRD STORY 5/6, A7 trust-by-parents):
 *   - base_dir under a configured trusted parent (MCP_WORKSPACE_ROOT_PARENTS)
 *     → the file resolves and the tool fixes it, reporting the base_dir as the
 *     effective root (root_source 'workspace');
 *   - base_dir outside every allowlist/parent → the exact
 *     PATH_REJECTED_OUTSIDE_ALLOWLIST rejection, before any file access.
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

const call = async (args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> => {
  const res = await executeLocalTool('drawio_auto_layout', args) as
    { isError: boolean; content: Array<{ type: string; text: string }> };
  return { isError: res.isError, text: res.content[0].text };
};

describe('SA4E-406 drawio tool call honours the session-root binding (A6/A7)', () => {
  let parent = '', child = '', untrusted = '';
  let savedRoots: string | undefined, savedParents: string | undefined;
  beforeAll(() => {
    parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dio-parent-')));
    child = path.join(parent, 'session-ws');
    fs.mkdirSync(child);
    untrusted = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dio-untrusted-')));
    savedRoots = process.env['MCP_WORKSPACE_ROOTS'];
    savedParents = process.env['MCP_WORKSPACE_ROOT_PARENTS'];
    process.env['MCP_WORKSPACE_ROOTS'] = ''; // allowlist empty — trust comes from the parent only
    process.env['MCP_WORKSPACE_ROOT_PARENTS'] = parent;
  });
  afterAll(() => {
    if (savedRoots === undefined) delete process.env['MCP_WORKSPACE_ROOTS']; else process.env['MCP_WORKSPACE_ROOTS'] = savedRoots;
    if (savedParents === undefined) delete process.env['MCP_WORKSPACE_ROOT_PARENTS']; else process.env['MCP_WORKSPACE_ROOT_PARENTS'] = savedParents;
    fs.rmSync(parent, { recursive: true, force: true });
    fs.rmSync(untrusted, { recursive: true, force: true });
  });

  it('resolves and fixes a file whose base_dir sits under a trusted parent', async () => {
    fs.writeFileSync(path.join(child, 'bunched.drawio'), BUNCH, 'utf-8');
    const r = await call({ file_path: 'bunched.drawio', base_dir: child });
    expect(r.isError).toBe(false);
    const out = JSON.parse(r.text);
    expect(out.status).toBe('fixed');
    expect(out.root_source).toBe('workspace');
    expect(path.resolve(out.effective_root).toLowerCase()).toBe(path.resolve(child).toLowerCase());
    // the relative file_path really did resolve INSIDE the session root
    const text = fs.readFileSync(path.join(child, 'bunched.drawio'), 'utf-8');
    expect(text).not.toBe(BUNCH); // the tool rewrote it
  }, 60_000);

  it('rejects a base_dir under no parent with the exact allowlist code', async () => {
    fs.writeFileSync(path.join(untrusted, 'x.drawio'), BUNCH, 'utf-8');
    const r = await call({ file_path: 'x.drawio', base_dir: untrusted });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    expect(fs.readFileSync(path.join(untrusted, 'x.drawio'), 'utf-8')).toBe(BUNCH); // untouched
  }, 60_000);
});
