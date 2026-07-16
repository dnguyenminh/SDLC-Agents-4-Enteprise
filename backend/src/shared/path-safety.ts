/**
 * SA4E-41 — Shared path-safety helpers (SEC-04 / SEC-05).
 *
 * Central guard against path traversal / arbitrary file access. Rejects absolute
 * paths, `..` traversal, and null bytes, and confirms a resolved path stays under
 * the (per-tenant) workspace root. Used by code_context, stream_write_file and the
 * /api/index/* write endpoints so no tool can read/write outside its workspace.
 */

import * as path from 'path';

/** Validate a relative path — reject absolute, traversal, and null-byte inputs. */
export function isPathSafe(relPath: string): boolean {
  if (!relPath || typeof relPath !== 'string') return false;
  if (relPath.includes('\0')) return false;
  const normalized = path.normalize(relPath);
  if (path.isAbsolute(normalized)) return false;
  if (normalized === '..' || normalized.startsWith('..')) return false;
  if (normalized.split(/[/\\]/).includes('..')) return false;
  return true;
}

/** True when `fullPath` is inside `root` (or equal to it). */
export function isWithinRoot(root: string, fullPath: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(fullPath);
  if (resolved === resolvedRoot) return true;
  return resolved.startsWith(resolvedRoot + path.sep);
}

/**
 * Resolve a relative path under `workspace`, returning null when the input is
 * unsafe or would escape the workspace. Callers must treat null as a rejection.
 */
export function resolveWithinWorkspace(workspace: string, relPath: string): string | null {
  if (!isPathSafe(relPath)) return null;
  const fullPath = path.resolve(workspace, relPath);
  if (!isWithinRoot(workspace, fullPath)) return null;
  return fullPath;
}
