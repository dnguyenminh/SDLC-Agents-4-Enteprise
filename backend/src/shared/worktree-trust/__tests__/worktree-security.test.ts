/** SA4E-393 Addendum 5 — symlink containment (SEC-WT-3/16/17), service wiring, PBT (WT-UT-17/22/32, WT-IT-26/27, WT-PBT-*). */
import * as fs from 'fs';
import * as path from 'path';
import fc from 'fast-check';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { realResolve, symlinkEscapeCheck } from '../symlink-containment.js';
import { WorktreeTrustService } from '../trust-service.js';
import { parseGitdirPointer } from '../git-files.js';
import { verifyWorktree } from '../verifier.js';
import { addWorktree, cleanupTmp, makeRepo, makeTmp, realDeps } from './worktree-fixture.js';

afterAll(cleanupTmp);

/** Create a link or skip the test when the OS forbids it (Windows without privilege). */
function link(ctx: { skip: () => void }, target: string, at: string, type: 'dir' | 'file' | 'junction' = 'dir'): boolean {
  try { fs.symlinkSync(target, at, type); return true; } catch { ctx.skip(); return false; }
}
const dirLink = process.platform === 'win32' ? 'junction' : 'dir';

describe('symlink containment (fail-closed, component-wise)', () => {
  it('clean path inside root → null; plain missing file inside → null', () => {
    const root = makeTmp();
    fs.mkdirSync(path.join(root, 'sub'));
    expect(symlinkEscapeCheck(root, path.join(root, 'sub', 'new.txt'))).toBeNull();
    expect(symlinkEscapeCheck(root, path.join(root, 'a', 'b', 'c.txt'))).toBeNull();
  });
  it('WT-IT-26 dangling symlink pointing outside is rejected (SEC-WT-3)', (ctx) => {
    const root = makeTmp(); const out = makeTmp();
    if (!link(ctx, path.join(out, 'missing'), path.join(root, 'notes'), dirLink)) return;
    expect(symlinkEscapeCheck(root, path.join(root, 'notes'))).toMatchObject({ reason: 'real_outside' });
  });
  it('WT-IT-27 chain, cycle and depth > 40 are rejected; in-root link accepted', (ctx) => {
    const root = makeTmp(); const out = makeTmp();
    fs.mkdirSync(path.join(root, 'real'));
    if (!link(ctx, path.join(root, 'real'), path.join(root, 'ok'), dirLink)) return;
    expect(symlinkEscapeCheck(root, path.join(root, 'ok', 'f.txt'))).toBeNull();
    link(ctx, out, path.join(root, 'l1'), dirLink);
    link(ctx, path.join(root, 'l1'), path.join(root, 'l2'), dirLink);
    expect(symlinkEscapeCheck(root, path.join(root, 'l2', 'x'))).toMatchObject({ reason: 'real_outside' });
    link(ctx, path.join(root, 'c2'), path.join(root, 'c1'), dirLink);
    link(ctx, path.join(root, 'c1'), path.join(root, 'c2'), dirLink);
    expect(symlinkEscapeCheck(root, path.join(root, 'c1', 'x'))).toMatchObject({ reason: 'link_depth' });
  });
  it('SEC-WT-16 symlinkDotDotCollapse: d -> outside, L -> d/../x is rejected', (ctx) => {
    const root = makeTmp(); const out = makeTmp();
    fs.mkdirSync(path.join(out, 'dir'));
    if (!link(ctx, path.join(out, 'dir'), path.join(root, 'd'), dirLink)) return;
    if (!link(ctx, path.join('d', '..', 'x'), path.join(root, 'L'), 'file')) return;
    expect(symlinkEscapeCheck(root, path.join(root, 'L'))).toMatchObject({ reason: 'real_outside' });
  });
  it('SEC-WT-17 symlinkDotDotInside: d -> sub/deep, L -> d/../x accepted', (ctx) => {
    const root = makeTmp();
    fs.mkdirSync(path.join(root, 'sub', 'deep'), { recursive: true });
    if (!link(ctx, path.join(root, 'sub', 'deep'), path.join(root, 'd'), dirLink)) return;
    if (!link(ctx, path.join('d', '..', 'x'), path.join(root, 'L'), 'file')) return;
    expect(symlinkEscapeCheck(root, path.join(root, 'L'))).toBeNull();
  });
  it('SEC-WT-16/17 via fake POSIX fs (runs on every host): collapse rejected, inside accepted, spelling-independent', () => {
    const mk = (links: Record<string, string>, dirs: string[]) => ({
      lstatSync: (p: string) => {
        if (links[p] !== undefined) return { isSymbolicLink: () => true };
        if (dirs.includes(p)) return { isSymbolicLink: () => false };
        throw Object.assign(new Error('nf'), { code: 'ENOENT' });
      },
      readlinkSync: (p: string) => links[p]!,
      realpathSync: (p: string) => p,
    }) as never;
    const outside = mk({ '/r/d': '/o/dir', '/r/L': 'd/../x' }, ['/', '/r', '/o', '/o/dir']);
    expect(symlinkEscapeCheck('/r', '/r/L', outside, 'linux')).toEqual({ reason: 'real_outside', real: '/o/x' });
    const inside = mk({ '/r/d': '/r/sub/deep', '/r/L': 'd/../x' }, ['/', '/r', '/r/sub', '/r/sub/deep']);
    expect(symlinkEscapeCheck('/r', '/r/L', inside, 'linux')).toBeNull();
    const cycle = mk({ '/r/a': 'b', '/r/b': 'a' }, ['/', '/r']);
    expect(symlinkEscapeCheck('/r', '/r/a', cycle, 'linux')).toEqual({ reason: 'link_depth' });
    const dangling = mk({ '/r/n': '/o/missing' }, ['/', '/r', '/o']);
    expect(symlinkEscapeCheck('/r', '/r/n', dangling, 'linux')).toMatchObject({ reason: 'real_outside' });
  });
  it('dotDotAfterMissing and fs errors fail closed', () => {
    const root = makeTmp();
    expect(realResolve([root, 'missingdir', '..', 'x'].join(path.sep))).toEqual({ escape: 'dotdot_after_missing' });
    const eacces = Object.assign(new Error('x'), { code: 'EACCES' });
    const fsx = { lstatSync: () => { throw eacces; }, readlinkSync: () => '' } as never;
    expect(realResolve(path.join(root, 'a'), fsx)).toEqual({ escape: 'fs_error' });
    expect(symlinkEscapeCheck(path.join(root, 'nope'), path.join(root, 'nope', 'f'))).toMatchObject({ reason: 'fs_error' });
  });
  it('WT-UT-32 `..` after a hop pops the REAL prefix (fake POSIX fs)', () => {
    const links: Record<string, string> = { '/r/d': '/o/dir', '/r/L': 'd/../x' };
    const dirs = new Set(['/', '/r', '/o', '/o/dir']);
    const fsx = {
      lstatSync: (p: string) => {
        if (links[p] !== undefined) return { isSymbolicLink: () => true };
        if (dirs.has(p)) return { isSymbolicLink: () => false };
        throw Object.assign(new Error('nf'), { code: 'ENOENT' });
      },
      readlinkSync: (p: string) => links[p]!,
    } as never;
    expect(realResolve('/r/L', fsx, 'linux')).toEqual({ real: '/o/x' }); // lexical collapse would give /r/x
  });
  it('UNC/device targets are rejected with zero fs access (win32 semantics)', () => {
    const lstat = vi.fn();
    const r = realResolve('\\\\host\\share\\x', { lstatSync: lstat, readlinkSync: vi.fn() } as never, 'win32');
    expect(r).toEqual({ escape: 'fs_error' });
    expect(lstat).not.toHaveBeenCalled();
  });
});

describe('WorktreeTrustService', () => {
  const quiet = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() });
  function svc(enabled: boolean, open: string[], log = quiet()) {
    const d = realDeps({ open });
    return { log, s: new WorktreeTrustService({ ...d, enabled: () => enabled, logger: log }) };
  }
  it('WT-UT-17 disabled → verdict disabled, no fs access', () => {
    const { s } = svc(false, []);
    expect(s.check(path.join(makeTmp(), 'x'))).toEqual({ trusted: false, reason: 'disabled' });
  });
  it('trusted verdict is cached; logs once on miss at warn without repoRoot, repoRoot only at debug', () => {
    const tmp = makeTmp(); const repo = makeRepo(tmp, 'repo');
    const wt = addWorktree(repo, path.join(tmp, 'w'), 'bw');
    const { s, log } = svc(true, [repo]);
    expect(s.check(wt)).toMatchObject({ trusted: true });
    expect(s.check(wt)).toMatchObject({ trusted: true });
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(repo);
    expect(JSON.stringify(log.info.mock.calls)).not.toContain(repo);
  });
  it('SEC-WT-24 removing an allowlist root invalidates a cached positive immediately', () => {
    const tmp = makeTmp(); const repo = makeRepo(tmp, 'repo');
    const wt = addWorktree(repo, path.join(tmp, 'w'), 'bw24');
    let roots: string[] = [fs.realpathSync(repo)];
    const base = realDeps({ allowlist: [repo] });
    const s = new WorktreeTrustService({
      ...base, enabled: () => true, logger: quiet(),
      allowlistRoots: () => roots, isAllowlisted: (p: string) => roots.includes(p),
    });
    expect(s.check(wt)).toMatchObject({ trusted: true });
    roots = [];
    expect(s.check(wt)).toMatchObject({ trusted: false });
  });
  it('rate-limits repeated rejections per reason', () => {
    const { s, log } = svc(true, []);
    const bad = path.join(makeTmp(), 'none');
    for (let i = 0; i < 20; i++) s.check(`${bad}${i}`);
    expect(log.warn.mock.calls.length).toBeLessThan(3);
  });
  it('WT-IT-24 open-folder env entries that are fs roots / home / non-repos are ignored', () => {
    const tmp = makeTmp();
    const { s } = svc(true, [path.parse(tmp).root, tmp]);
    expect(s.openFoldersEffective()).toEqual([]);
  });
});

describe('SEC-WT-20 bare layout', () => {
  it('forgedBareInOrdinaryRepo: S/worktrees/x inside an allowlisted ordinary repo is not a registration', () => {
    const tmp = makeTmp();
    const S = path.join(tmp, 'S'); const B = path.join(tmp, 'B');
    fs.mkdirSync(path.join(S, '.git'), { recursive: true });
    fs.writeFileSync(path.join(S, 'HEAD'), 'ref: refs/heads/main\n');
    fs.mkdirSync(path.join(S, 'worktrees', 'x'), { recursive: true });
    fs.writeFileSync(path.join(S, 'worktrees', 'x', 'gitdir'), `${path.join(B, '.git')}\n`);
    fs.mkdirSync(B);
    fs.writeFileSync(path.join(B, '.git'), `gitdir: ${path.join(S, 'worktrees', 'x')}\n`);
    const v = verifyWorktree(fs.realpathSync(B), realDeps({ allowlist: [S] }));
    expect(v).toEqual({ trusted: false, reason: 'submodule_or_unknown_layout' });
  });
  it('forged bare without objects/refs (no .git) is rejected even when allowlisted', () => {
    const tmp = makeTmp();
    const S = path.join(tmp, 'S'); const B = path.join(tmp, 'B');
    fs.mkdirSync(path.join(S, 'worktrees', 'x'), { recursive: true });
    fs.writeFileSync(path.join(S, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(S, 'worktrees', 'x', 'gitdir'), `${path.join(B, '.git')}\n`);
    fs.mkdirSync(B);
    fs.writeFileSync(path.join(B, '.git'), `gitdir: ${path.join(S, 'worktrees', 'x')}\n`);
    expect(verifyWorktree(fs.realpathSync(B), realDeps({ allowlist: [S] }))).toMatchObject({ trusted: false });
  });
});

describe('PBT', () => {
  it('WT-PBT-01 arbitrary .git content is never trusted and never throws', () => {
    const tmp = makeTmp(); const repo = makeRepo(tmp, 'repo');
    const dir = path.join(tmp, 'pbt'); fs.mkdirSync(dir);
    fc.assert(fc.property(fc.string({ maxLength: 300 }), (txt) => {
      fs.writeFileSync(path.join(dir, '.git'), txt);
      const v = verifyWorktree(dir, realDeps({ open: [repo] }));
      return v.trusted === false;
    }), { numRuns: 60 });
  });
  it('WT-PBT-03 pointers: ok values contain no control chars; never throws', () => {
    fc.assert(fc.property(fc.string({ maxLength: 1200 }), fc.constantFrom('win32', 'linux') as fc.Arbitrary<NodeJS.Platform>, (s, p) => {
      const r = parseGitdirPointer(`gitdir: ${s}`, p);
      return r.ok ? [...r.value].every((ch) => ch.charCodeAt(0) >= 32) && r.value.length <= 1024 : (r.reason === 'malformed' || r.reason === 'unc_unsupported');
    }));
  });
});
