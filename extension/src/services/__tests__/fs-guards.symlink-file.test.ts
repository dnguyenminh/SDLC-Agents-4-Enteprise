/**
 * SA4E-406 F2 — file-level symlink escape guard for checkSymlinkGuardForPath.
 *
 * Uses REAL symlinks (like the pre-existing SQ-1 test in
 * backend-local-tools.symlink.test.ts). fs.symlinkSync is not permitted on
 * Windows without elevation, so symlink-dependent cases gracefully skip with
 * console.warn when symlink creation throws (CI runs on Linux where they work).
 * Non-symlink cases (regular file, non-existent path) always run.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { checkSymlinkGuardForPath } from '../../backend-local-tools/fs-guards';

const TMP_DIR = path.join(__dirname, '.tmp-fs-guards-symlink-file');

describe('SA4E-406 F2 — checkSymlinkGuardForPath file-level symlink escape', () => {
  let caseDir: string;
  let outsideDir: string;
  let symlinksAvailable = false;

  beforeAll(() => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    caseDir = path.join(TMP_DIR, 'f2-links');
    outsideDir = path.join(TMP_DIR, '..', 'sa4e-406-f2-outside');
    fs.mkdirSync(caseDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(path.join(outsideDir, 'secret.md'), 'secret');
    fs.writeFileSync(path.join(caseDir, 'inner.md'), 'inner');
    try {
      // File symlinks; mirror SQ-1 style (no type for file links).
      fs.symlinkSync(path.join(outsideDir, 'secret.md'), path.join(caseDir, 'link-out.md'));
      fs.symlinkSync(path.join(caseDir, 'inner.md'), path.join(caseDir, 'link-in.md'));
      symlinksAvailable = true;
    } catch (err: any) {
      console.warn(`F2 SKIPPED: symlink creation unavailable (${err?.message ?? err})`);
    }
  });

  it('allows a regular file inside the root', () => {
    expect(
      checkSymlinkGuardForPath(path.join(caseDir, 'inner.md'), TMP_DIR, 'inner.md'),
    ).toBeNull();
  });

  it('allows a non-existent path (new-file writes keep working)', () => {
    expect(
      checkSymlinkGuardForPath(
        path.join(caseDir, 'does-not-exist.md'),
        TMP_DIR,
        'does-not-exist.md',
      ),
    ).toBeNull();
  });

  it('rejects a symlink whose real target is outside the root', () => {
    if (!symlinksAvailable) {
      console.warn('F2 SKIPPED: symlinks unavailable');
      return;
    }
    const msg = checkSymlinkGuardForPath(
      path.join(caseDir, 'link-out.md'),
      TMP_DIR,
      'link-out.md',
    );
    expect(msg).toContain('PATH_REJECTED_OUTSIDE_WORKSPACE');
  });

  it('allows a symlink whose real target is inside the root', () => {
    if (!symlinksAvailable) {
      console.warn('F2 SKIPPED: symlinks unavailable');
      return;
    }
    expect(
      checkSymlinkGuardForPath(path.join(caseDir, 'link-in.md'), TMP_DIR, 'link-in.md'),
    ).toBeNull();
  });

  afterAll(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });
});
