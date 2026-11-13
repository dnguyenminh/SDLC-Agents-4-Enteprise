/** SA4E-393 Addendum 5 — pure units: path-fold, git-files, messages, config, cache (WT-UT-*). */
import * as fs from 'fs';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { TrustCache } from '../cache.js';
import { loadTrustConfig, parseAutotrustFlag } from '../config.js';
import { nodeFs, parseBacklink, parseGitdirPointer, readSmall } from '../git-files.js';
import { buildRejectionDetail, reasonGroup } from '../messages.js';
import { foldKey, hasBadWinComponent, isInsideFolded, isUncOrDevice, samePath, stripExtendedPrefix } from '../path-fold.js';
import type { WorktreeReason, WorktreeVerdict } from '../types.js';
import { cleanupTmp, makeTmp } from './worktree-fixture.js';

afterAll(cleanupTmp);

describe('path-fold', () => {
  it('WT-UT-11 stripExtendedPrefix / samePath / foldKey', () => {
    expect(stripExtendedPrefix('\\\\?\\C:\\a\\b')).toBe('C:\\a\\b');
    expect(samePath('C:\\Repo\\X', '\\\\?\\c:\\repo\\x', 'win32')).toBe(true);
    expect(samePath('/a/B', '/a/b', 'linux')).toBe(false);
    expect(foldKey('/A', 'linux')).toBe('/A');
  });
  it('isUncOrDevice only on win32', () => {
    for (const p of ['\\\\h\\s', '//h/s', '\\\\?\\UNC\\h\\s', '\\\\.\\pipe\\x', '\\\\?\\GLOBALROOT\\x']) {
      expect(isUncOrDevice(p, 'win32')).toBe(true);
      expect(isUncOrDevice(p, 'linux')).toBe(false);
    }
    expect(isUncOrDevice('\\\\?\\C:\\a', 'win32')).toBe(false);
    expect(isUncOrDevice('C:\\a', 'win32')).toBe(false);
  });
  it('hasBadWinComponent: ADS, reserved names, trailing dot/space', () => {
    for (const p of ['C:\\a:s', 'C:\\x\\NUL', 'C:\\x\\com1.txt', 'C:\\x\\a.', 'C:\\x\\a ']) {
      expect(hasBadWinComponent(p, 'win32')).toBe(true);
    }
    expect(hasBadWinComponent('C:\\x\\a.b\\v~1-fix', 'win32')).toBe(false);
    expect(hasBadWinComponent('C:\\x\\a.', 'linux')).toBe(false);
  });
  it('isInsideFolded: boundary-aware', () => {
    expect(isInsideFolded('/r/a', '/r/a/b', 'linux')).toBe(true);
    expect(isInsideFolded('/r/a', '/r/ab', 'linux')).toBe(false);
    expect(isInsideFolded('C:\\R', 'c:\\r\\x', 'win32')).toBe(true);
  });
});

describe('git-files parsing', () => {
  it('WT-UT-01..08 parseGitdirPointer', () => {
    expect(parseGitdirPointer('gitdir: /r/.git/worktrees/w\n', 'linux')).toEqual({ ok: true, value: '/r/.git/worktrees/w' });
    expect(parseGitdirPointer('gitdir: ../x\r\n', 'linux')).toEqual({ ok: true, value: '../x' });
    for (const bad of ['gitdir: a\nb\n', '/r/x', 'gitdir: a\0b', `gitdir: ${'a'.repeat(1025)}`, 'gitdir: ', 'gitdir: a\tb']) {
      expect(parseGitdirPointer(bad, 'linux')).toEqual({ ok: false, reason: 'malformed' });
    }
    expect(parseGitdirPointer('gitdir: \\\\h\\s\\x', 'win32').ok).toBe(false);
    expect(parseBacklink('/r/w/.git\n', 'linux')).toEqual({ ok: true, value: '/r/w/.git' });
    expect(parseBacklink('a\nb', 'linux').ok).toBe(false);
  });
  it('WT-UT-09 readSmall: 4096 ok, 4097 limit, dir/missing typed', () => {
    const d = makeTmp();
    fs.writeFileSync(path.join(d, 'ok'), 'x'.repeat(4096));
    fs.writeFileSync(path.join(d, 'big'), 'x'.repeat(4097));
    expect(readSmall(path.join(d, 'ok'), 4096).ok).toBe(true);
    expect(readSmall(path.join(d, 'big'), 4096)).toMatchObject({ ok: false, reason: 'limit_exceeded' });
    expect(readSmall(d, 4096)).toMatchObject({ ok: false, reason: 'not_a_worktree' });
    expect(readSmall(path.join(d, 'nope'), 4096)).toMatchObject({ ok: false, reason: 'missing' });
  });
});

describe('messages', () => {
  const legacy = (b: string): string => `Workspace root '${b}' is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS to include this path.`;
  it('WT-UT-12 exact strings per group; reason token and other paths never leak', () => {
    const all: WorktreeReason[] = ['not_a_worktree', 'malformed', 'limit_exceeded', 'unc_unsupported', 'io_error', 'admin_missing',
      'submodule_or_unknown_layout', 'commondir_mismatch', 'backlink_missing', 'backlink_mismatch', 'parent_not_trusted', 'bare_not_registered', 'disabled'];
    for (const r of all) {
      const text = buildRejectionDetail('/b', r);
      expect(text.startsWith(legacy('/b'))).toBe(true);
      expect(text).not.toContain(r === 'disabled' ? 'zzz' : r);
      expect(text.replace(legacy('/b'), '')).not.toMatch(/[\\/][A-Za-z]/); // only MCP_WORKSPACE_ROOTS-style words, no extra path
    }
    for (const r of ['not_a_worktree', 'disabled', 'unc_unsupported'] as const) expect(buildRejectionDetail('/b', r)).toBe(legacy('/b'));
    expect(reasonGroup('parent_not_trusted')).toBe('parent');
    expect(buildRejectionDetail('/b', 'parent_not_trusted')).toContain('must be in MCP_WORKSPACE_ROOTS or be the open workspace folder.');
    expect(buildRejectionDetail('/b', 'backlink_mismatch')).toContain('Alternatively, use a git worktree of the open workspace repository.');
  });
  it('sanitizes control characters in the echoed path', () => {
    expect(buildRejectionDetail('/a\nb\0', 'not_a_worktree')).toBe(legacy('/a?b?'));
  });
});

describe('config', () => {
  it('WT-UT-25 flag table: fail-closed on unknown values', () => {
    for (const v of [undefined, '', '  ', '1', 'true', 'ON', 'Yes']) expect(parseAutotrustFlag(v).enabled).toBe(true);
    for (const v of ['0', 'false', ' 0 ', 'OFF', 'no']) expect(parseAutotrustFlag(v)).toMatchObject({ enabled: false, invalid: false });
    for (const v of ['disable', 'of', 'maybe']) expect(parseAutotrustFlag(v)).toMatchObject({ enabled: false, invalid: true });
  });
  it('disable wins between env and setting; setting errors disable', () => {
    expect(loadTrustConfig({ MCP_WORKTREE_AUTOTRUST: '1' }, () => false).enabled()).toBe(false);
    expect(loadTrustConfig({ MCP_WORKTREE_AUTOTRUST: '0' }, () => true).enabled()).toBe(false);
    expect(loadTrustConfig({}, () => { throw new Error('x'); }).enabled()).toBe(false);
    expect(loadTrustConfig({}).enabled()).toBe(true);
  });
  it('WT-UT-13 open folders: delimiter split, empties dropped, cap 16', () => {
    const many = Array.from({ length: 20 }, (_, i) => `/f${i}`).join(path.delimiter);
    expect(loadTrustConfig({ MCP_OPEN_WORKSPACE_FOLDERS: many }).openFolders).toHaveLength(16);
    expect(loadTrustConfig({ MCP_OPEN_WORKSPACE_FOLDERS: ` /a${path.delimiter}${path.delimiter}/b ` }).openFolders).toEqual(['/a', '/b']);
  });
});

describe('TrustCache', () => {
  const ev = (realBase: string) => ({ realBase, gitPath: '/b/.git', gitSig: 'g1', linkPath: '/a/gitdir', linkSig: 'l1' });
  const trusted: WorktreeVerdict = { trusted: true, kind: 'main', repoRoot: '/r', evidence: ev('/b') };
  function mk(): { c: TrustCache; t: { now: number }; sigs: Record<string, string>; calls: string[] } {
    const t = { now: 0 };
    const sigs: Record<string, string> = { '/b/.git': 'g1', '/a/gitdir': 'l1' };
    const calls: string[] = [];
    const fsx = {
      ...nodeFs,
      lstat: (p: string) => { calls.push(`lstat:${p}`); if (sigs[p] === undefined) throw Object.assign(new Error('x'), { code: 'ENOENT' }); return { sig: sigs[p] } as never; },
      realpath: (p: string) => { calls.push(`realpath:${p}`); return p; },
    };
    const c = new TrustCache(fsx, () => t.now, (s) => (s as unknown as { sig: string }).sig);
    return { c, t, sigs, calls };
  }
  it('WT-IT-19 hit costs 2 lstat + 1 realpath, 0 reads; invalidated by .git / back-link change', () => {
    const { c, sigs, calls } = mk();
    c.put('/b', trusted, 'ctx');
    calls.length = 0;
    expect(c.get('/b', 'ctx', '/b')).toBe(trusted);
    expect(calls.filter((x) => x.startsWith('lstat'))).toHaveLength(2);
    expect(calls.filter((x) => x.startsWith('realpath'))).toHaveLength(1);
    sigs['/a/gitdir'] = 'changed';
    expect(c.get('/b', 'ctx', '/b')).toBeNull();
    c.put('/b', trusted, 'ctx');
    delete sigs['/b/.git'];
    expect(c.get('/b', 'ctx', '/b')).toBeNull();
  });
  it('TTL: positive 10 s, negative 5 s; ctx change evicts', () => {
    const { c, t, sigs } = mk();
    c.put('/b', trusted, 'ctx');
    t.now = 9_999;
    expect(c.get('/b', 'ctx', '/b')).toBe(trusted);
    t.now = 10_001;
    expect(c.get('/b', 'ctx', '/b')).toBeNull();
    const neg: WorktreeVerdict = { trusted: false, reason: 'not_a_worktree' };
    delete sigs['/n/.git'];
    t.now = 0;
    c.put('/n', neg, 'ctx');
    t.now = 4_999;
    expect(c.get('/n', 'ctx', '/n')).toBe(neg);
    expect(c.get('/n', 'other', '/n')).toBeNull();
    c.put('/n', neg, 'ctx');
    t.now = 10_000;
    expect(c.get('/n', 'ctx', '/n')).toBeNull();
  });
  it('WT-UT-30 negative flood does not evict positives; buckets 128/64', () => {
    const { c } = mk();
    c.put('/b', trusted, 'ctx');
    for (let i = 0; i < 500; i++) c.put(`/n${i}`, { trusted: false, reason: 'not_a_worktree' }, 'ctx');
    expect(c.sizes()).toEqual({ positive: 1, negative: 64 });
    for (let i = 0; i < 300; i++) c.put(`/p${i}`, trusted, 'ctx');
    expect(c.sizes().positive).toBe(128);
  });
  it('WT-IT-30 realpath re-bind: swapped base_dir evicts', () => {
    const { c } = mk();
    c.put('/b', { ...trusted, evidence: ev('/elsewhere') } as WorktreeVerdict, 'ctx');
    expect(c.get('/b', 'ctx', '/b')).toBeNull();
  });
});
