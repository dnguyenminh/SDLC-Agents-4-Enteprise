import { describe, it, expect, beforeAll, vi } from 'vitest';
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: process.cwd() } }]
  }
}));
import * as fs from 'fs';
import * as path from 'path';
import { TMP_DIR } from './backend-local-tools.fixtures';

describe('checkSymlinkGuard (STC IT-10 SQ-1 guard unit, SEC-03)', () => {
  beforeAll(() => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  it('passes normal in-root paths', async () => {
    const { checkSymlinkGuard } = await import('../backend-local-tools');
    const target = path.join(TMP_DIR, 'sq1-normal.md');
    fs.writeFileSync(target, 'x');
    expect(
      checkSymlinkGuard({ ok: true, resolvedPath: target, rootSource: 'workspace', rootPath: TMP_DIR }, target),
    ).toBeNull();
  });

  it('skips the guard on cwd_fallback (no boundary there)', async () => {
    const { checkSymlinkGuard } = await import('../backend-local-tools');
    expect(
      checkSymlinkGuard(
        { ok: true, resolvedPath: '/elsewhere/x.md', rootSource: 'cwd_fallback', rootPath: process.cwd() },
        '/elsewhere/x.md',
      ),
    ).toBeNull();
  });

  it('reports FS_ERROR when the parent is missing', async () => {
    const { checkSymlinkGuard } = await import('../backend-local-tools');
    const target = path.join(TMP_DIR, 'sq1-no-such-dir', 'x.md');
    const err = checkSymlinkGuard(
      { ok: true, resolvedPath: target, rootSource: 'workspace', rootPath: TMP_DIR },
      target,
    );
    expect(err).toContain('FS_ERROR: Failed to resolve parent dir');
  });

  // STC: IT-10 — symlink escape blocked, internal link passes. Graceful skip
  // when the OS/user forbids symlink creation (N-QA3).
  it('blocks symlink escapes but passes internal links (or skips gracefully)', async () => {
    const { checkSymlinkGuard } = await import('../backend-local-tools');
    const caseDir = path.join(TMP_DIR, 'sq1-links');
    const outsideDir = path.join(TMP_DIR, '..', 'sa4e-356-sq1-outside');
    try {
      fs.mkdirSync(caseDir, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });
      fs.writeFileSync(path.join(outsideDir, 'secret.md'), 'secret');
      fs.writeFileSync(path.join(caseDir, 'inner.md'), 'inner');
    } catch {
      console.warn('SQ-1 SKIPPED: fixture setup unavailable');
      return;
    }
    let linkOut: string;
    let linkIn: string;
    try {
      linkOut = path.join(caseDir, 'link-out');
      linkIn = path.join(caseDir, 'link-in.md');
      const type = process.platform === 'win32' ? 'junction' : undefined;
      try {
        (fs as any).symlinkSync(outsideDir, linkOut, type as any);
      } catch {
        // Junction fallback for the dir link on Windows without privilege.
        (fs as any).symlinkSync(outsideDir, linkOut, 'junction');
      }
      fs.symlinkSync(path.join(caseDir, 'inner.md'), linkIn);
    } catch (err: any) {
      console.warn(`SQ-1 SKIPPED: symlink creation unavailable (${err?.message ?? err})`);
      return;
    }
    try {
      // (a) read via outward link → blocked by the parent-realpath re-check.
      const viaOut = path.join(linkOut, 'secret.md');
      const blocked = checkSymlinkGuard(
        { ok: true, resolvedPath: viaOut, rootSource: 'workspace', rootPath: TMP_DIR },
        viaOut,
      );
      expect(blocked).toContain('PATH_REJECTED_OUTSIDE_WORKSPACE:');
      // (b) internal link → passes (node_modules/.bin-style use intact).
      const inner = fs.realpathSync(linkIn);
      expect(
        checkSymlinkGuard(
          { ok: true, resolvedPath: linkIn, rootSource: 'workspace', rootPath: TMP_DIR },
          linkIn,
        ),
      ).toBeNull();
      expect(inner.startsWith(TMP_DIR)).toBe(true);
    } finally {
      fs.rmSync(caseDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
