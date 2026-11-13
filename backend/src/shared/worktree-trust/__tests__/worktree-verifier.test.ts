/** SA4E-393 Addendum 5 — verifier against REAL `git worktree add` layouts (WT-IT-01..17, 25, 29). */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { verifyWorktree } from '../verifier.js';
import { addWorktree, cleanupTmp, git, makeRepo, makeTmp, realDeps } from './worktree-fixture.js';

afterAll(cleanupTmp);

const reason = (v: ReturnType<typeof verifyWorktree>): string => (v.trusted ? 'trusted' : v.reason);

function setup(): { tmp: string; repo: string; wt: string } {
  const tmp = makeTmp();
  const repo = makeRepo(tmp, 'repo');
  return { tmp, repo, wt: addWorktree(repo, path.join(tmp, 'wt1'), 'b1') };
}

describe('verifyWorktree — acceptance', () => {
  it('WT-IT-01 worktree of an open-folder repo is trusted (main)', () => {
    const { repo, wt } = setup();
    const v = verifyWorktree(wt, realDeps({ open: [repo] }));
    expect(v).toMatchObject({ trusted: true, kind: 'main', repoRoot: repo });
  });
  it('WT-IT-02 parent in allowlist (not open) is trusted', () => {
    const { repo, wt } = setup();
    expect(reason(verifyWorktree(wt, realDeps({ allowlist: [repo] })))).toBe('trusted');
  });
  it('WT-IT-10 worktree nested inside the main repo is trusted; plain sub-dir is not', () => {
    const { tmp, repo } = setup();
    const nested = addWorktree(repo, path.join(repo, 'nested-wt'), 'b2');
    expect(reason(verifyWorktree(nested, realDeps({ open: [repo] })))).toBe('trusted');
    const sub = path.join(nested, 'sub');
    fs.mkdirSync(sub);
    expect(reason(verifyWorktree(sub, realDeps({ open: [repo] })))).toBe('not_a_worktree');
    expect(tmp).toBeTruthy();
  });
  it('WT-IT-16 absent commondir falls back to <admin>/../..', () => {
    const { repo, wt } = setup();
    const adminName = fs.readdirSync(path.join(repo, '.git', 'worktrees'))[0]!;
    fs.rmSync(path.join(repo, '.git', 'worktrees', adminName, 'commondir'));
    expect(reason(verifyWorktree(wt, realDeps({ open: [repo] })))).toBe('trusted');
  });
  it('WT-IT-17 move without repair is rejected (backlink_missing: old target gone), repair restores', () => {
    const { tmp, repo, wt } = setup();
    const moved = path.join(tmp, 'moved');
    fs.renameSync(wt, moved);
    expect(reason(verifyWorktree(moved, realDeps({ open: [repo] })))).toBe('backlink_missing');
    git(repo, ['worktree', 'repair', moved]);
    expect(reason(verifyWorktree(moved, realDeps({ open: [repo] })))).toBe('trusted');
  });
});

describe('verifyWorktree — rejection', () => {
  it('WT-IT-03 worktree of an untrusted repo → parent_not_trusted', () => {
    const { wt } = setup();
    expect(reason(verifyWorktree(wt, realDeps({ open: [] })))).toBe('parent_not_trusted');
  });
  it('WT-IT-04 forged pointer / copied worktree → rejected, never trusted', () => {
    const { tmp, repo, wt } = setup();
    const forged = path.join(tmp, 'forged');
    fs.mkdirSync(forged);
    fs.copyFileSync(path.join(wt, '.git'), path.join(forged, '.git'));
    expect(reason(verifyWorktree(forged, realDeps({ open: [repo] })))).toBe('backlink_mismatch');
    const copied = path.join(tmp, 'copied');
    fs.cpSync(wt, copied, { recursive: true });
    expect(reason(verifyWorktree(copied, realDeps({ open: [repo] })))).toBe('backlink_mismatch');
  });
  it('WT-IT-05 back-link file deleted → backlink_missing', () => {
    const { repo, wt } = setup();
    const name = fs.readdirSync(path.join(repo, '.git', 'worktrees'))[0]!;
    fs.rmSync(path.join(repo, '.git', 'worktrees', name, 'gitdir'));
    expect(reason(verifyWorktree(wt, realDeps({ open: [repo] })))).toBe('backlink_missing');
  });
  it('WT-IT-06 submodule .git pointer → submodule_or_unknown_layout', () => {
    const { tmp, repo } = setup();
    const sub = path.join(repo, 'sub');
    fs.mkdirSync(path.join(repo, '.git', 'modules', 'sub'), { recursive: true });
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, '.git'), 'gitdir: ../.git/modules/sub\n');
    expect(reason(verifyWorktree(sub, realDeps({ open: [repo] })))).toBe('submodule_or_unknown_layout');
    expect(tmp).toBeTruthy();
  });
  it('WT-IT-08 deleted working dir / pruned admin → rejected', () => {
    const { repo, wt } = setup();
    fs.rmSync(wt, { recursive: true, force: true });
    expect(reason(verifyWorktree(wt, realDeps({ open: [repo] })))).toBe('not_a_worktree');
  });
  it('WT-IT-08b admin removed (prune) → admin_missing', () => {
    const { repo, wt } = setup();
    const name = fs.readdirSync(path.join(repo, '.git', 'worktrees'))[0]!;
    fs.rmSync(path.join(repo, '.git', 'worktrees', name), { recursive: true });
    expect(reason(verifyWorktree(wt, realDeps({ open: [repo] })))).toBe('admin_missing');
  });
  it('WT-IT-09 worktree of a bare repo: unregistered rejected, registered trusted', () => {
    const tmp = makeTmp();
    const src = makeRepo(tmp, 'src');
    const bare = path.join(tmp, 'bare.git');
    git(tmp, ['clone', '-q', '--bare', src, bare]);
    const wt = path.join(tmp, 'bwt');
    git(bare, ['worktree', 'add', '-q', wt, 'main']);
    const real = fs.realpathSync(wt);
    expect(reason(verifyWorktree(real, realDeps({ open: [fs.realpathSync(bare)] })))).toBe('bare_not_registered');
    expect(verifyWorktree(real, realDeps({ allowlist: [bare] }))).toMatchObject({ trusted: true, kind: 'bare' });
  });
  it('WT-IT-11 .git file larger than 4 KB → limit_exceeded', () => {
    const { repo, wt } = setup();
    fs.appendFileSync(path.join(wt, '.git'), 'x'.repeat(5000));
    expect(reason(verifyWorktree(wt, realDeps({ open: [repo] })))).toBe('limit_exceeded');
  });
  it('WT-IT-13 NUL in pointer → malformed', () => {
    const { tmp, repo } = setup();
    const d = path.join(tmp, 'nul');
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, '.git'), `gitdir: ${repo}\0/.git/worktrees/x\n`);
    expect(reason(verifyWorktree(d, realDeps({ open: [repo] })))).toBe('malformed');
  });
  it('WT-IT-15 commondir pointing at another trusted repo → commondir_mismatch', () => {
    const { tmp, repo, wt } = setup();
    const other = makeRepo(tmp, 'other');
    const name = fs.readdirSync(path.join(repo, '.git', 'worktrees'))[0]!;
    fs.writeFileSync(path.join(repo, '.git', 'worktrees', name, 'commondir'), `${other}/.git\n`);
    expect(reason(verifyWorktree(wt, realDeps({ open: [repo, other] })))).toBe('commondir_mismatch');
  });
  it('WT-IT-14 .git as symlink/junction is never followed → not_a_worktree', (ctx) => {
    const { tmp, repo } = setup();
    const link = path.join(tmp, 'linkwt');
    fs.mkdirSync(link);
    const gitDir = path.join(link, 'realgit'); fs.mkdirSync(gitDir);
    try { fs.symlinkSync(gitDir, path.join(link, '.git'), 'junction'); } catch { ctx.skip(); return; }
    expect(reason(verifyWorktree(link, realDeps({ open: [repo] })))).toBe('not_a_worktree');
  });
  it('WT-IT-30 base_dir that is a link to another dir is verified on its real path only', (ctx) => {
    const { tmp, repo, wt } = setup();
    const link = path.join(tmp, 'dirlink');
    try { fs.symlinkSync(wt, link, 'junction'); } catch { ctx.skip(); return; }
    const v = verifyWorktree(link, realDeps({ open: [repo] }));
    // Real path is a valid worktree: verification passes on the real path (grant is a root string only;
    // symlink containment rejects file_path later — see resolver tests).
    expect(reason(v)).toBe('trusted');
  });
});

describe('verifyWorktree — placement and path forms', () => {
  it('WT-IT-29 base_dir equal to / ancestor of the repo or $HOME is rejected', () => {
    const { tmp, repo, wt } = setup();
    expect(reason(verifyWorktree(wt, realDeps({ open: [repo], home: wt })))).toBe('submodule_or_unknown_layout');
    expect(reason(verifyWorktree(wt, realDeps({ open: [repo], home: path.join(wt, 'deep') })))).toBe('submodule_or_unknown_layout');
    expect(tmp).toBeTruthy();
  });
  it('WT-UT-16 UNC / device / ADS / reserved names → zero fs calls (win32 rules)', () => {
    const calls: string[] = [];
    const d = realDeps({ platform: 'win32' });
    const spy = { ...d.fs, lstat: (p: string) => { calls.push(p); return d.fs.lstat(p); }, realpath: (p: string) => { calls.push(p); return d.fs.realpath(p); } };
    for (const p of ['\\\\host\\share\\x', '\\\\?\\UNC\\h\\x', '\\\\.\\pipe\\x', 'C:\\a\\CON', 'C:\\a:stream', 'C:\\a\\b. ']) {
      expect(verifyWorktree(p, { ...d, fs: spy }).trusted).toBe(false);
    }
    expect(calls).toEqual([]);
  });
  it('WT-UT-15 budget exceeded between steps → limit_exceeded', () => {
    const { repo, wt } = setup();
    let t = 0;
    const v = verifyWorktree(wt, realDeps({ open: [repo], now: () => (t += 300) }));
    expect(reason(v)).toBe('limit_exceeded');
  });
  it('never spawns processes: library imports no child_process', () => {
    const dir = path.join(__dirname, '..');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      expect(fs.readFileSync(path.join(dir, f), 'utf8')).not.toMatch(/child_process/);
    }
    expect(os.platform()).toBeTruthy();
  });
});
