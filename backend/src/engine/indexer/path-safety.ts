/**
 * SA4E-223 F-01 — Symlink containment guard for the workspace scanner.
 *
 * The shared `isWithinRoot` (shared/path-safety.ts) only does `path.resolve`,
 * which does NOT dereference symlinks. A symlink *inside* the workspace that
 * points *outside* it would therefore pass a string-based containment check yet
 * be read via `fs.readFileSync`/`statSync` following the link. We canonicalize
 * with `fs.realpathSync` so the real target is what we verify against.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Returns true when the already-canonicalized `realPath` lies inside the
 * already-canonicalized `root` (or equals it). Callers must pass real paths.
 */
export function isWithinWorkspace(realPath: string, root: string): boolean {
  return realPath === root || realPath.startsWith(root + path.sep);
}

/**
 * Resolve the canonical workspace root, falling back to a string resolve.
 *
 * Uses `realpathSync.native` because on Windows the JS `realpathSync` does NOT
 * expand DOS 8.3 short names (e.g. C:\Users\NGUYEN~1\…) — it echoes back whatever
 * form the INPUT had — while `.native` always expands short→long
 * (C:\Users\nguyenminhduc3\…). Since `os.tmpdir()`/config workspaces can be short
 * form, every realpath in this module must go through `.native` or root and
 * per-file paths diverge → containment fails → "Found 0 files".
 */
export function resolveWorkspaceRoot(workspace: string): string {
  try {
    return fs.realpathSync.native(workspace);
  } catch {
    try {
      return fs.realpathSync(workspace);
    } catch {
      return path.resolve(workspace);
    }
  }
}

/**
 * Canonicalize a single path with the SAME semantics as `resolveWorkspaceRoot`.
 * Returns null when the path cannot be resolved (missing/broken link).
 *
 * `realpathSync.native` always expands Windows 8.3 short names (NGUYEN~1 →
 * long); the JS `realpathSync` just echoes the input's form. Callers comparing
 * a per-file path against the root must use this so both sides share a form.
 */
export function canonicalRealPathSync(filePath: string): string | null {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    try {
      return fs.realpathSync(filePath);
    } catch {
      return null;
    }
  }
}

/**
 * Resolve `filePath` to its canonical real path and return it only when the
 * real path lies inside `workspace`. Returns null on escape OR any fs error
 * (broken link, missing file) so callers can safely skip the entry.
 */
export function resolveContainedPath(filePath: string, workspace: string): string | null {
  const realPath = canonicalRealPathSync(filePath);
  if (!realPath) return null;
  const root = resolveWorkspaceRoot(workspace);
  return isWithinWorkspace(realPath, root) ? realPath : null;
}
