/**
 * SA4E-393 Addendum 5 — resolver integration: auto-trust of git worktrees, allowlist-first,
 * kill switch, UNC guard (SEC-WT-2), hardened symlink containment (SEC-WT-3), legacy gate.
 */
import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { resolveLegacyRead } from '../legacy-path-gate.js';
import { MultiWorktreePathResolver } from '../multi-worktree-path-resolver.js';
import { WorkspaceAllowlist } from '../workspace-allowlist.js';
import { createWorktreeTrust } from '../worktree-trust-factory.js';
import { addWorktree, cleanupTmp, git, makeRepo, makeTmp } from '../worktree-trust/__tests__/worktree-fixture.js';

afterAll(cleanupTmp);
const log = pino({ level: 'silent' });
const LEGACY = (b: string): string =>
  `PATH_REJECTED_OUTSIDE_ALLOWLIST: Workspace root '${b}' is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS to include this path.`;

function build(repo: string, env: NodeJS.ProcessEnv = {}) {
  const allowlist = WorkspaceAllowlist.load(repo, log, {});
  const trust = createWorktreeTrust(allowlist, repo, log, env);
  return { allowlist, resolver: new MultiWorktreePathResolver(allowlist, repo, log, trust) };
}
function world() {
  const tmp = makeTmp();
  const repo = makeRepo(tmp, 'repo');
  return { tmp, repo, wt: addWorktree(repo, path.join(tmp, 'wt'), 'bx') };
}

describe('auto-trust of worktrees', () => {
  it('WT-IT-01/20 worktree of the open repo is accepted: rootSource base_dir, trustSource worktree, BR-07 intact', () => {
    const { repo, wt } = world();
    const { resolver } = build(repo);
    const r = resolver.resolve({ baseDir: wt, filePath: 'README.md' });
    expect(r).toMatchObject({ ok: true, rootSource: 'base_dir', trustSource: 'worktree', effectiveRoot: wt });
    expect(resolver.resolve({ baseDir: wt, filePath: '../outside.txt' })).toMatchObject({ ok: false, code: 'PATH_REJECTED_OUTSIDE_ALLOWLIST' });
    expect(resolver.resolve({ baseDir: wt, filePath: path.join(repo, 'README.md') })).toMatchObject({ ok: false });
  });
  it('allowlist hit wins: trust port never called, trustSource allowlist', () => {
    const { repo } = world();
    const allowlist = WorkspaceAllowlist.load(repo, log, {});
    const trust = { check: vi.fn() };
    const r = new MultiWorktreePathResolver(allowlist, repo, log, trust).resolve({ baseDir: repo, filePath: 'README.md' });
    expect(r).toMatchObject({ ok: true, trustSource: 'allowlist' });
    expect(trust.check).not.toHaveBeenCalled();
  });
  it('plain dir keeps the byte-identical legacy message; forged pointer is rejected with only <b>', () => {
    const { tmp, repo, wt } = world();
    const { resolver } = build(repo);
    const plain = path.join(tmp, 'plain'); fs.mkdirSync(plain);
    expect(resolver.resolve({ baseDir: plain, filePath: 'a' })).toMatchObject({ ok: false, message: LEGACY(plain) });
    const forged = path.join(tmp, 'forged'); fs.mkdirSync(forged);
    fs.copyFileSync(path.join(wt, '.git'), path.join(forged, '.git'));
    const r = resolver.resolve({ baseDir: forged, filePath: 'a' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message.startsWith(LEGACY(forged))).toBe(true);
    expect(r.message).not.toContain(repo);
    expect(r.message).not.toContain('backlink');
  });
  it('kill switch MCP_WORKTREE_AUTOTRUST=0 → legacy rejection; unknown value also disables', () => {
    const { repo, wt } = world();
    for (const v of ['0', 'disable']) {
      const { resolver } = build(repo, { MCP_WORKTREE_AUTOTRUST: v });
      expect(resolver.resolve({ baseDir: wt, filePath: 'README.md' })).toMatchObject({ ok: false, message: LEGACY(wt) });
    }
  });
  it('MCP_OPEN_WORKSPACE_FOLDERS (instance env) trusts a second repo; request args cannot', () => {
    const { tmp, repo } = world();
    const other = makeRepo(tmp, 'other');
    const owt = addWorktree(other, path.join(tmp, 'owt'), 'bo');
    expect(build(repo).resolver.resolve({ baseDir: owt, filePath: 'README.md' }).ok).toBe(false);
    const { resolver } = build(repo, { MCP_OPEN_WORKSPACE_FOLDERS: other });
    expect(resolver.resolve({ baseDir: owt, filePath: 'README.md' }).ok).toBe(true);
  });
  it('WT-IT-08 worktree removed after acceptance is re-verified and rejected', () => {
    const { repo, wt } = world();
    const { resolver } = build(repo);
    expect(resolver.resolve({ baseDir: wt, filePath: 'README.md' }).ok).toBe(true);
    git(repo, ['worktree', 'remove', '--force', wt]);
    expect(resolver.resolve({ baseDir: wt, filePath: 'README.md' })).toMatchObject({ ok: false, code: 'PATH_REJECTED_OUTSIDE_ALLOWLIST' });
  });
});

describe('hardened containment', () => {
  it('SEC-WT-3 committed dangling symlink to the outside is rejected for a trusted worktree', (ctx) => {
    const { repo, wt } = world();
    const out = makeTmp();
    try { fs.symlinkSync(path.join(out, 'missing'), path.join(wt, 'notes'), 'junction'); } catch { ctx.skip(); return; }
    const { resolver } = build(repo);
    expect(resolver.resolve({ baseDir: wt, filePath: 'notes' })).toMatchObject({ ok: false, code: 'PATH_REJECTED_OUTSIDE_ALLOWLIST' });
  });
  it('legacy-path-gate benefits from the hardened guard (absolute link out of the pinned root)', (ctx) => {
    const root = makeTmp(); const out = makeTmp();
    try { fs.symlinkSync(out, path.join(root, 'ln'), 'junction'); } catch { ctx.skip(); return; }
    const r = resolveLegacyRead({ pinnedRoot: root, allowlistRoots: [], filePath: path.join(root, 'ln', 'x') });
    expect(r.ok).toBe(false);
  });
});

describe('UNC / device guard before any realpath (SEC-WT-2)', () => {
  it('resolver rejects UNC with the legacy message and never calls allowlist.contains or trust (win32 only)', (ctx) => {
    if (process.platform !== 'win32') { ctx.skip(); return; }
    const allowlist = { contains: vi.fn(() => false), hasLiteral: vi.fn(() => false), snapshot: () => [] } as unknown as WorkspaceAllowlist;
    const trust = { check: vi.fn() };
    const r = new MultiWorktreePathResolver(allowlist, 'C:\\x', log, trust);
    for (const b of ['\\\\192.0.2.1\\share\\w', '\\\\?\\UNC\\192.0.2.1\\s\\w', '\\\\.\\pipe\\x']) {
      expect(r.resolve({ baseDir: b, filePath: 'a' })).toMatchObject({ ok: false, code: 'PATH_REJECTED_OUTSIDE_ALLOWLIST' });
    }
    expect(allowlist.contains).not.toHaveBeenCalled();
    expect(trust.check).not.toHaveBeenCalled();
  });
  it('WorkspaceAllowlist.contains does not realpath an unlisted UNC path (win32 only, fast)', (ctx) => {
    if (process.platform !== 'win32') { ctx.skip(); return; }
    const a = WorkspaceAllowlist.load('C:\\Windows', log, {});
    const t0 = Date.now();
    expect(a.contains('\\\\192.0.2.1\\share\\x')).toBe(false);
    expect(Date.now() - t0).toBeLessThan(300);
  });
  it('hasLiteral is a pure folded Set lookup (no fs)', () => {
    const root = makeTmp();
    const a = WorkspaceAllowlist.load(root, log, {});
    expect(a.hasLiteral(root)).toBe(true);
    expect(a.hasLiteral(path.join(root, 'sub'))).toBe(false);
  });
});
