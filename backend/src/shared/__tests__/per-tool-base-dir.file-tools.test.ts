/**
 * SA4E-394 — BR-20 per-tool matrix (STC TC-307 / TC-310, AC1–AC5; TC-311 drawio_auto_layout moved to the extension).
 * Real handlers + real fixture filesystem; the Atlassian/DB/executor tools
 * (mem_ingest_file, jira/confluence attachments, sandbox_run) are covered in
 * per-tool-base-dir.service-tools.test.ts, the extension surface in the
 * extension package (backend-local-tools.base-dir.test.ts — TC-309/TC-702).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { MultiWorktreePathResolver } from '../multi-worktree-path-resolver.js';
import { setSharedPathResolver, resetSharedPathResolver } from '../path-resolver-provider.js';
import { createWorktreeFixture, type MultiWorktreeFixture } from './multi-worktree-fixture.js';
import { WorkspaceAllowlist } from '../workspace-allowlist.js';
import {
  handleDrawioExportPng, resetRendererCache, DRAWIO_EXPORT_PNG_DEFINITION,
} from '../../engine/tools/drawio-export-png.js';
import { findDrawioCli, setCachedDrawioCliPath } from '../../engine/tools/drawio-renderers.js';
import { UtilityModule } from '../../modules/utility/UtilityModule.js';
import { CODE_INTEL_TOOL_DEFINITIONS } from '../../engine/tools/register-tools.js';
import { silentLogger } from '../../__tests__/sa4e-testkit.js';

const BAD_LAYOUT = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="t"><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="n1" value="A" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="n2" value="B" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="50" y="50" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="n1" target="n2">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;

let fx: MultiWorktreeFixture;
let resolver: MultiWorktreePathResolver;
const ALLOWLIST_MSG = 'is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS';
const CONTAINMENT_MSG = 'is outside workspace root';

beforeAll(() => {
  fx = createWorktreeFixture();
  fs.mkdirSync(path.join(fx.main, 'diag'), { recursive: true });
  fs.writeFileSync(path.join(fx.main, 'diag', 'flow.drawio'), BAD_LAYOUT);
  fs.writeFileSync(path.join(fx.wtB, 'diag', 'flow.drawio'), BAD_LAYOUT);
  const allowlist = WorkspaceAllowlist.load(fx.main, fx.logger, {
    MCP_WORKSPACE_ROOTS: fx.allowlistEnv,
  } as NodeJS.ProcessEnv);
  resolver = new MultiWorktreePathResolver(allowlist, fx.main, fx.logger);
  setSharedPathResolver(resolver);                 // production wiring (index.ts)
  process.env.CODE_INTEL_WORKSPACE = fx.main;      // legacy root for UtilityModule
  const cli = findDrawioCli();
  if (cli) setCachedDrawioCliPath(cli);
});

afterAll(() => {
  delete process.env.CODE_INTEL_WORKSPACE;
  resetSharedPathResolver();
  resetRendererCache();
  fx.cleanup();
});

const text = (r: { content: Array<{ type: string; text: string }> }): string => r.content[0].text;

/** UtilityModule-backed stream_write_file handler (module variant, initialized). */
async function utilityHandler() {
  if (!cachedUtility) {
    cachedUtility = new UtilityModule(silentLogger());
    await cachedUtility.initialize(); // workspace = CODE_INTEL_WORKSPACE (fixture main)
  }
  return cachedUtility.getToolHandlers().get('stream_write_file')!;
}
let cachedUtility: UtilityModule | null = null;

describe('TC-307 — stream_write_file (module variant, arguments `path`/`file_path`)', () => {
  it('S1 (AC1): relative path + base_dir writes under worktree B', async () => {
    const r = await (await utilityHandler())({ path: 'tmp/ug-proof.txt', content: 'ok', base_dir: fx.wtB });
    expect(r.isError).toBe(false);
    expect(fs.readFileSync(path.join(fx.wtB, 'tmp', 'ug-proof.txt'), 'utf-8')).toBe('ok');
  });

  it('S2 (AC2): unregistered base_dir rejected BEFORE any write (BR-23)', async () => {
    const r = await (await utilityHandler())({ path: 'tmp/evil.txt', content: 'x', base_dir: fx.wtUnreg });
    expect((text(r)).indexOf('PATH_REJECTED_OUTSIDE_ALLOWLIST')).toBe(0);
    expect(text(r)).toContain(ALLOWLIST_MSG);
    expect(fs.existsSync(path.join(fx.wtUnreg, 'tmp', 'evil.txt'))).toBe(false);
  });

  it('S3 (AC3): base_dir omitted → legacy pinned-root behavior', async () => {
    const r = await (await utilityHandler())({ path: 'tmp/legacy.txt', content: 'legacy' });
    expect(r.isError).toBe(false);
    expect(fs.readFileSync(path.join(fx.main, 'tmp', 'legacy.txt'), 'utf-8')).toBe('legacy');
  });

  it('S4/S5 (AC4): absolute outside + ../ traversal escape rejected', async () => {
    const r = await (await utilityHandler())({ path: path.join(fx.outside, 'capture.txt'), content: 'x', base_dir: fx.wtB });
    expect(text(r)).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    expect(text(r)).toContain(CONTAINMENT_MSG);
    const r2 = await (await utilityHandler())({ path: '../../../outside/out.txt', content: 'x', base_dir: fx.wtB });
    expect(text(r2)).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
  });

  it('param-name parity (DISC-3): file_path behaves identically to path', async () => {
    const r = await (await utilityHandler())({ file_path: 'tmp/parity.txt', content: 'ok', base_dir: fx.wtB });
    expect(r.isError).toBe(false);
    expect(fs.readFileSync(path.join(fx.wtB, 'tmp', 'parity.txt'), 'utf-8')).toBe('ok');
  });
});

describe('TC-310 — drawio_export_png (file_path reference-only, DISC-4)', () => {
  const b64 = Buffer.from(BAD_LAYOUT).toString('base64');

  function exporter(baseDir?: string, filePath?: string): Promise<string> {
    const args: Record<string, unknown> = { content_base64: b64 };
    if (filePath) args.file_path = filePath;
    if (baseDir) args.base_dir = baseDir;
    return handleDrawioExportPng(args, fx.main, undefined, resolver);
  }

  it('S1 (AC1): registered base_dir → resolution passes and export proceeds', async () => {
    const out = JSON.parse(await exporter(fx.wtB, 'diag/flow.drawio'));
    if (out.success !== true) expect(String(out.error)).toContain('No renderer'); // env gap, NOT path
  });

  it('S2 (AC2): unregistered root rejected before any rendering', async () => {
    const out = JSON.parse(await exporter(fx.wtUnreg, 'diag/flow.drawio'));
    expect(String(out.error)).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    expect(String(out.error)).toContain(ALLOWLIST_MSG);
  });

  it('S3 (AC3): base_dir omitted → legacy behavior (reference path untouched)', async () => {
    const out = JSON.parse(await exporter(undefined, 'diag/flow.drawio'));
    if (out.success !== true) expect(String(out.error)).toContain('No renderer');
  });

  it('S4/S5 (AC4): absolute outside + ../ traversal rejected', async () => {
    const out = JSON.parse(await exporter(fx.wtB, path.join(fx.outside, 'evil.drawio')));
    expect(String(out.error)).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    expect(String(out.error)).toContain(CONTAINMENT_MSG);
    const out2 = JSON.parse(await exporter(fx.wtB, '../../../outside/x.drawio'));
    expect(String(out2.error)).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
  });
});

describe('TC-301/TC-5 — base_dir + workspace_root documented on backend schemas (AC5)', () => {
  const schemas: Array<[string, Record<string, unknown>]> = [
    ['code-intel stream_write_file', propsOf(CODE_INTEL_TOOL_DEFINITIONS.find(t => t.name === 'stream_write_file')!)],
    ['drawio_export_png', propsOf(DRAWIO_EXPORT_PNG_DEFINITION)],
  ];

  it('every schema documents base_dir (description + example) and the alias', () => {
    for (const [name, props] of schemas) {
      expect((props.base_dir as { description: string }).description).toContain('Example:');
      expect((props.workspace_root as { description: string }).description)
        .toContain('Ignored when base_dir is present');
      void name;
    }
  });
});

function propsOf(def: { inputSchema: { properties: Record<string, unknown> } }): Record<string, unknown> {
  return def.inputSchema.properties;
}
