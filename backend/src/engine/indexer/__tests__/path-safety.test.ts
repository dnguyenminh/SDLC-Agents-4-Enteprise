/**
 * SA4E-223 F-01 — Symlink path-traversal containment tests.
 * Verifies that files outside the workspace (and symlinks escaping it) are
 * rejected by the containment guard and by scanSingleFile.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  resolveContainedPath,
  isWithinWorkspace,
  resolveWorkspaceRoot,
} from '../path-safety.js';
import { scanSingleFile } from '../file-scanner.js';

let dir: string;
let outside: string;
let symlinkSupported = false;
let insideFile: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-ps-'));
  insideFile = path.join(dir, 'a.ts');
  fs.writeFileSync(insideFile, 'export const x = 1;\n');
  outside = path.join(os.tmpdir(), `ci-ps-outside-${Date.now()}.txt`);
  fs.writeFileSync(outside, 'TOP SECRET');
  try {
    fs.symlinkSync(outside, path.join(dir, 'escape'));
    symlinkSupported = true;
  } catch {
    symlinkSupported = false;
  }
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  try { fs.unlinkSync(outside); } catch { /* ignore */ }
});

describe('path-safety containment', () => {
  it('allows a real file inside the workspace', () => {
    const resolved = resolveContainedPath(insideFile, dir);
    expect(resolved).not.toBeNull();
    // Compare against the native form: plain realpathSync echoes the input's
    // 8.3 short form while the guard canonicalizes with realpathSync.native.
    expect(resolved).toBe(fs.realpathSync.native(insideFile));
  });

  it('rejects a file outside the workspace', () => {
    expect(resolveContainedPath(outside, dir)).toBeNull();
  });

  it('isWithinWorkspace is true for contained path, false for escape', () => {
    const root = resolveWorkspaceRoot(dir);
    const inReal = fs.realpathSync.native(insideFile);
    expect(isWithinWorkspace(inReal, root)).toBe(true);
    expect(isWithinWorkspace(fs.realpathSync.native(outside), root)).toBe(false);
  });

  it.skipIf(!symlinkSupported)('rejects a symlink that escapes the workspace', () => {
    const link = path.join(dir, 'escape');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(resolveContainedPath(link, dir)).toBeNull();
  });
});

describe('scanSingleFile (F-01 integration)', () => {
  it('indexes a normal file inside the workspace', () => {
    const scanned = scanSingleFile(insideFile, dir);
    expect(scanned).not.toBeNull();
    expect(scanned!.relativePath).toBe('a.ts');
  });

  it('returns null for a path outside the workspace', () => {
    expect(scanSingleFile(outside, dir)).toBeNull();
  });

  it.skipIf(!symlinkSupported)('returns null for an escaping symlink', () => {
    expect(scanSingleFile(path.join(dir, 'escape'), dir)).toBeNull();
  });
});
