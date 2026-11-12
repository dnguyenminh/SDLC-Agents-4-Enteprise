/**
 * SA4E-406 F2 — file-level symlink escape guard for checkSymlinkGuardForPath.
 * The guard realpaths only the PARENT dir, so an existing workspace file that
 * is itself a symlink pointing outside must be rejected. Non-existent paths
 * stay ALLOWED (new-file writes).
 *
 * fs.symlinkSync is not permitted on Windows without elevation, so the fs
 * module is mocked to simulate lstat/realpath behaviour.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { checkSymlinkGuardForPath } from '../../backend-local-tools/fs-guards';

const mockRealpath = vi.hoisted(() => vi.fn());
const mockLstat = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
  realpathSync: mockRealpath,
  lstatSync: mockLstat,
}));

import * as fs from 'fs';

describe('SA4E-406 F2 — checkSymlinkGuardForPath file-level symlink escape', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRealpath.mockReturnValue('C:\\workspace');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a workspace file that is itself a symlink to outside the root', () => {
    const file = 'C:\\workspace\\link.drawio';
    mockLstat.mockReturnValue({ isSymbolicLink: () => true } as fs.Stats);

    const msg = checkSymlinkGuardForPath(file, 'C:\\workspace', 'link.drawio');
    expect(msg).toContain('PATH_REJECTED_OUTSIDE_WORKSPACE');
  });

  it('allows a regular file inside the root', () => {
    const file = 'C:\\workspace\\regular.drawio';
    mockLstat.mockReturnValue({ isSymbolicLink: () => false } as fs.Stats);

    const msg = checkSymlinkGuardForPath(file, 'C:\\workspace', 'regular.drawio');
    expect(msg).toBeNull();
  });

  it('allows a non-existent path (lstat throws ENOENT → new-file writes keep working)', () => {
    const file = 'C:\\workspace\\new.drawio';
    const e: any = new Error('ENOENT: no such file or directory');
    e.code = 'ENOENT';
    mockLstat.mockImplementation(() => { throw e; });

    const msg = checkSymlinkGuardForPath(file, 'C:\\workspace', 'new.drawio');
    expect(msg).toBeNull();
  });
});
