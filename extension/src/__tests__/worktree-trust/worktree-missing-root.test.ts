/** SA4E-393 SEC-WT-25 — containment must fail closed when the root is missing or cannot be realpath-ed. */
import * as fs from 'fs';
import * as path from 'path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { symlinkEscapeCheck } from '../../services/worktree-trust/symlink-containment';
import { checkSymlinkGuardBeforeEnsureDir } from '../../backend-local-tools/fs-guards';
import { cleanupTmp, makeTmp } from './worktree-fixture';

afterAll(cleanupTmp);

const gate = vi.hoisted(() => ({ fail: false }));
vi.mock('fs', async (orig) => {
  const actual = await orig<typeof import('fs')>();
  const realpathSync = Object.assign((...a: Parameters<typeof actual.realpathSync>) => {
    if (gate.fail) throw new Error('EACCES: permission denied, realpath INTERNAL_SECRET_DIR');
    return actual.realpathSync(...a);
  }, { native: actual.realpathSync.native });
  return { ...actual, realpathSync, default: { ...actual, realpathSync } };
});

const SECRET = 'EACCES: permission denied, realpath INTERNAL_SECRET_DIR';

/** fs double whose realpath throws an error carrying an internal detail. */
const throwingFs = {
  lstatSync: () => { throw Object.assign(new Error('nf'), { code: 'ENOENT' }); },
  readlinkSync: () => '',
  realpathSync: () => { throw Object.assign(new Error(SECRET), { code: 'EACCES' }); },
} as never;

function resolution(rootPath: string, resolvedPath: string): never {
  return { ok: true, rootSource: 'workspace', rootPath, resolvedPath } as never;
}

describe('SEC-WT-25 fail-closed when root is missing / unresolvable', () => {
  it('(a) non-existent root → fs_error, guard returns PATH_REJECTED without throwing', () => {
    const root = path.join(makeTmp(), 'does-not-exist');
    expect(fs.existsSync(root)).toBe(false);
    const target = path.join(root, 'f.txt');
    expect(symlinkEscapeCheck(root, target)).toEqual({ reason: 'fs_error' });
    const msg = checkSymlinkGuardBeforeEnsureDir(resolution(root, target), 'f.txt');
    expect(msg).toMatch(/^PATH_REJECTED_OUTSIDE_WORKSPACE/);
  });
  it('(b) realpath throws → fs_error, no error text leaked, guard rejects without throwing', () => {
    const r = symlinkEscapeCheck('/r', '/r/f.txt', throwingFs, 'linux');
    expect(r).toEqual({ reason: 'fs_error' });
    expect(JSON.stringify(r)).not.toContain('INTERNAL_SECRET_DIR');
  });
  it('(b) realpath throws inside the real guard (mocked fs.realpathSync) → PATH_REJECTED, no raw error leaked', () => {
    const root = makeTmp(); const target = path.join(root, 'f.txt');
    gate.fail = true;
    try {
      let msg: string | null = null;
      expect(() => { msg = checkSymlinkGuardBeforeEnsureDir(resolution(root, target), 'f.txt'); }).not.toThrow();
      expect(msg).toMatch(/^PATH_REJECTED_OUTSIDE_WORKSPACE/);
      expect(msg).not.toContain('INTERNAL_SECRET_DIR');
    } finally { gate.fail = false; }
  });
});
