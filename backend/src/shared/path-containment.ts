/**
 * SA4E-394 T3/T5/T9 — containment primitives shared by the resolver and legacy-path-gate.
 * Split out of multi-worktree-path-resolver.ts (200-line budget); re-exported there unchanged.
 */
import { isWithinRoot } from './path-safety.js';
import * as path from 'path';
import { symlinkEscapeCheck } from './worktree-trust/symlink-containment.js';

/**
 * T3 — fail-closed symlink guard (SEC-WT-3/16/17): thin wrapper over the component-wise
 * resolver in worktree-trust/symlink-containment.ts. Returns the escaped real path (or the
 * input path when the real location is unknown, e.g. fs error) or null when contained.
 */
export function symlinkEscape(root: string, resolvedPath: string): string | null {
  const escape = symlinkEscapeCheck(root, resolvedPath);
  return escape === null ? null : escape.real ?? resolvedPath;
}

/** T5/T9 — separator-boundary + win32 case-fold containment (extension parity). */
export function containsFolded(root: string, candidate: string): boolean {
  if (process.platform !== 'win32') return isWithinRoot(root, candidate);
  const fold = (p: string): string => p.toLowerCase();
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (fold(resolved) === fold(resolvedRoot)) return true;
  return fold(resolved).startsWith(fold(resolvedRoot + path.sep));
}

