/**
 * SA4E-394 — extension-surface base_dir matrix.
 * TC-309: embed_image extension adapter (S1–S5, AC1–AC4).
 * TC-702: contract parity — resolveWorkspacePath over the shared scenario
 * set produces identical codes/messages as the backend resolver
 * (backend/src/shared/__tests__/per-tool-base-dir.*.test.ts).
 *
 * Under vitest require("vscode") is unavailable, so the allowlist mirror
 * falls back to MCP_WORKSPACE_ROOTS (base-dir-resolution readEnvRoots).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { executeLocalTool } from '../backend-local-tools';
import { resolveWorkspacePath } from '../services/PathResolver';

const BASE = path.join(__dirname, '.tmp-base-dir-matrix');
const MAIN = path.join(BASE, 'main'); // legacy pinned root
const WTB = path.join(BASE, 'wt-b'); // registered worktree B
const WTUNREG = path.join(BASE, 'wt-unreg'); // NOT registered
const OUTSIDE = path.join(BASE, 'outside'); // outside every root

const LOGO_BYTES = 'wt-b-logo-bytes';
const ALLOWLIST_MSG = 'is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS';
const CONTAINMENT_MSG = 'is outside workspace root';

beforeAll(() => {
  fs.mkdirSync(path.join(MAIN, 'img'), { recursive: true });
  fs.mkdirSync(path.join(MAIN, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(WTB, 'img'), { recursive: true });
  fs.mkdirSync(path.join(WTB, 'docs'), { recursive: true });
  fs.mkdirSync(WTUNREG, { recursive: true });
  fs.mkdirSync(OUTSIDE, { recursive: true });
  fs.writeFileSync(path.join(WTB, 'img', 'logo.png'), Buffer.from(LOGO_BYTES));
  fs.writeFileSync(path.join(MAIN, 'img', 'logo.png'), Buffer.from(LOGO_BYTES));
  fs.writeFileSync(path.join(WTB, 'doc.md'), '![logo](img/logo.png)');
  fs.writeFileSync(path.join(MAIN, 'legacy.md'), '![logo](img/logo.png)');
  process.env.MCP_WORKSPACE_ROOTS = [MAIN, WTB].join(path.delimiter);
});

afterAll(() => {
  delete process.env.MCP_WORKSPACE_ROOTS;
  fs.rmSync(BASE, { recursive: true, force: true });
});

// STC: TC-309 — BR-20 per-tool matrix, embed_image (extension adapter)
describe('TC-309 — embed_image (extension adapter, TC-702 parity)', () => {
  it('S1 (AC1): relative file_path + base_dir → wt-b image embedded', async () => {
    const r = await executeLocalTool('embed_image', { file_path: 'doc.md', base_dir: WTB });
    expect(r.isError).toBe(false);
    const out = fs.readFileSync(path.join(WTB, 'doc-embedded.md'), 'utf-8');
    expect(out).toContain(`data:image/png;base64,${Buffer.from(LOGO_BYTES).toString('base64')}`);
  });

  it('S2 (AC2): unregistered base_dir → PATH_REJECTED..., identical contract', async () => {
    const r = await executeLocalTool('embed_image', { file_path: 'docs/doc.md', base_dir: WTUNREG });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    expect(r.content[0].text).toContain(ALLOWLIST_MSG);
  });

  it('S3 (AC3): base_dir omitted → legacy pinned-root behavior unchanged', async () => {
    const r = await executeLocalTool('embed_image', { file_path: path.join(MAIN, 'legacy.md') });
    expect(r.isError).toBe(false);
    const out = fs.readFileSync(path.join(MAIN, 'legacy-embedded.md'), 'utf-8');
    expect(out).toContain('data:image/png;base64,');
  });

  it('S4/S5 (AC4): absolute outside + ../ escape rejected (containment)', async () => {
    const r = await executeLocalTool('embed_image', { file_path: path.join(OUTSIDE, 'doc.md'), base_dir: WTB });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    const r2 = await executeLocalTool('embed_image', { file_path: '../../../outside/doc.md', base_dir: WTB });
    expect(r2.isError).toBe(true);
    expect(r2.content[0].text).toContain(CONTAINMENT_MSG);
  });
});

// STC: TC-702 — extension-surface contract parity (shared scenario fixture)
describe('TC-702 — resolveWorkspacePath contract parity with backend resolver', () => {
  it('BR-02/BR-04: relative resolves against base_dir; absolute passes through', () => {
    const okAbs = resolveWorkspacePath(path.join(WTB, 'img', 'logo.png'), { baseDir: WTB });
    expect(okAbs.ok).toBe(true);
    const okRel = resolveWorkspacePath('docs/doc.md', { baseDir: WTB });
    expect(okRel.ok).toBe(true);
    if (okRel.ok) expect(okRel.resolvedPath).toBe(path.join(WTB, 'docs', 'doc.md'));
  });

  it('BR-10: base_dir wins over the deprecated workspace_root alias', () => {
    const r = resolveWorkspacePath('docs/doc.md', { baseDir: WTB, workspaceRoot: WTUNREG });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolvedPath).toBe(path.join(WTB, 'docs', 'doc.md'));
  });

  it('AC2 parity: unregistered root → backend-identical code AND message', () => {
    const r = resolveWorkspacePath('docs/doc.md', { baseDir: WTUNREG });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('PATH_REJECTED_OUTSIDE_ALLOWLIST');
      expect(r.message).toBe(
        `PATH_REJECTED_OUTSIDE_ALLOWLIST: Workspace root '${WTUNREG}' ` +
        'is not registered in the allowlist. ' +
        'Configure MCP_WORKSPACE_ROOTS to include this path.',
      );
    }
  });

  it('AC4 parity: traversal escape → backend-identical containment message', () => {
    const r = resolveWorkspacePath('../../../outside/doc.md', { baseDir: WTB });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('PATH_REJECTED_OUTSIDE_ALLOWLIST');
      expect(r.message).toBe(
        `PATH_REJECTED_OUTSIDE_ALLOWLIST: Resolved path '${path.join(WTB, '..', '..', '..', 'outside', 'doc.md')}' ` +
        `is outside workspace root '${WTB}'`,
      );
    }
  });
});
