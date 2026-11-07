/**
 * SA4E-394 — Shared multi-worktree path resolver (BR-20: ONE pipeline for all
 * 8 file_path tools). Normative order (BR-11): extract base_dir (BR-10) →
 * normalize (BR-09) → allowlist (BR-05) → existence (BR-06) → resolve
 * (BR-02/04) → containment AFTER resolution (BR-07, incl. symlink T3).
 * Legacy branch (base_dir omitted) keeps legacy pinned-root semantics with the
 * legacy error code (BR-03, C-3). Error-as-value: never throws on business
 * paths (§1.4). All echoed paths pass sanitizePathText (T6 — anti log-forging).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from 'pino';
import { isWithinRoot, resolveWithinWorkspace } from './path-safety.js';
import { sanitizePathText, type PathResolutionErr, type PathResolutionResult } from './path-resolution-types.js';
import { WorkspaceAllowlist } from './workspace-allowlist.js';

export { getSharedPathResolver, resetSharedPathResolver } from './path-resolver-provider.js';

export interface ResolvePathInput {
  /** Tool's file_path / path / file argument (validated inside). */
  filePath: unknown;
  /** args.base_dir. */
  baseDir?: unknown;
  /** args.workspace_root — deprecated alias (BR-10); base_dir wins. */
  workspaceRoot?: unknown;
}

export class MultiWorktreePathResolver {
  private readonly log: Logger;

  constructor(
    private readonly allowlist: WorkspaceAllowlist,
    private readonly legacyRoot: string,
    logger: Logger,
  ) {
    this.log = logger.child({ module: 'mw-path-resolver' });
  }

  /** Per-call resolution — see module doc for the normative pipeline. */
  resolve(input: ResolvePathInput): PathResolutionResult {
    const base = extractBaseDir(input);
    if (base === INVALID_BASE_DIR) {
      return err('PATH_REJECTED_OUTSIDE_ALLOWLIST', 'base_dir must be a non-empty string workspace root', '', '');
    }
    if (base === undefined) return this.resolveLegacy(input.filePath);
    return this.resolveWithBaseDir(base, input.filePath);
  }

  /** BR-03/BR-04/C-3 — legacy pinned-root semantics, legacy error code. */
  private resolveLegacy(filePath: unknown): PathResolutionResult {
    if (typeof filePath === 'string' && filePath.trim() !== '' && !filePath.includes('\0')) {
      const trimmed = filePath.trim();
      if (path.isAbsolute(trimmed)) return this.resolveLegacyAbsolute(trimmed); // BR-04
      const resolved = resolveWithinWorkspace(this.legacyRoot, trimmed);        // legacy relative semantics
      if (resolved !== null) {
        return { ok: true, resolvedPath: resolved, effectiveRoot: this.legacyRoot, rootSource: 'legacy' };
      }
    }
    return err(
      'PATH_REJECTED_OUTSIDE_WORKSPACE',
      `Path rejected: ${sanitizePathText(String(filePath ?? ''))} resolves outside backend workspace ` +
        `${sanitizePathText(this.legacyRoot)}.`,
      this.legacyRoot,
      '',
    );
  }

  /** BR-04 (legacy) — absolute paths accepted only inside the pinned root. */
  private resolveLegacyAbsolute(trimmed: string): PathResolutionResult {
    const resolved = path.resolve(trimmed);
    if (isWithinRoot(this.legacyRoot, resolved)) {
      return { ok: true, resolvedPath: resolved, effectiveRoot: this.legacyRoot, rootSource: 'legacy' };
    }
    return err(
      'PATH_REJECTED_OUTSIDE_WORKSPACE',
      `Path rejected: ${sanitizePathText(trimmed)} resolves to ${sanitizePathText(resolved)} — outside backend ` +
        `workspace ${sanitizePathText(this.legacyRoot)}.`,
      this.legacyRoot,
      resolved,
    );
  }

  /** BR-05/06 — allowlist membership BEFORE filesystem existence (BR-11). */
  private resolveWithBaseDir(rawBaseDir: string, filePath: unknown): PathResolutionResult {
    const baseDir = path.resolve(rawBaseDir.trim()); // BR-09 — before allowlist check (T8)
    if (!this.allowlist.contains(baseDir)) {
      this.log.warn({ base_dir: sanitizePathText(baseDir) }, 'base_dir rejected — not in allowlist');
      return err(
        'PATH_REJECTED_OUTSIDE_ALLOWLIST',
        `Workspace root '${sanitizePathText(baseDir)}' is not registered in the allowlist. ` +
          'Configure MCP_WORKSPACE_ROOTS to include this path.',
        baseDir,
        '',
      );
    }
    if (!isDirectory(baseDir)) {
      return err('FS_ERROR', `Workspace root '${sanitizePathText(baseDir)}' does not exist on filesystem`, baseDir, '');
    }
    return this.containAndResolve(baseDir, filePath);
  }

  /** BR-02/04 + BR-07 — resolve file_path, then enforce containment (T1/T2). */
  private containAndResolve(baseDir: string, filePath: unknown): PathResolutionResult {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      return err('PATH_REJECTED_OUTSIDE_ALLOWLIST', 'file_path must be a non-empty string', baseDir, '');
    }
    const trimmed = filePath.trim();
    if (trimmed.includes('\0')) {
      return err('PATH_REJECTED_OUTSIDE_ALLOWLIST', 'file_path contains invalid characters (NUL byte)', baseDir, '');
    }
    const resolvedPath = path.isAbsolute(trimmed)
      ? path.resolve(trimmed)            // BR-04 — absolute passthrough
      : path.resolve(baseDir, trimmed);  // BR-02 — relative against base_dir
    if (!containsFolded(baseDir, resolvedPath)) return this.containmentErr(baseDir, resolvedPath);
    const escape = symlinkEscape(baseDir, resolvedPath); // T3 — runtime symlink guard
    if (escape !== null) return this.containmentErr(baseDir, escape);
    return { ok: true, resolvedPath, effectiveRoot: baseDir, rootSource: 'base_dir' };
  }

  private containmentErr(baseDir: string, resolvedPath: string): PathResolutionResult {
    this.log.warn(
      { resolved_path: sanitizePathText(resolvedPath), effective_root: sanitizePathText(baseDir) },
      'containment rejected — resolved path outside effective root',
    );
    return err(
      'PATH_REJECTED_OUTSIDE_ALLOWLIST',
      `Resolved path '${sanitizePathText(resolvedPath)}' is outside workspace root '${sanitizePathText(baseDir)}'`,
      baseDir,
      resolvedPath,
    );
  }

  /** SEC-01 — configured roots for the legacy-read gate (legacy-path-gate.ts). */
  allowlistRoots(): readonly string[] { return this.allowlist.snapshot(); }
}

/** Sentinel — a non-string base_dir was supplied (TC-406: typed error, no echo). */
const INVALID_BASE_DIR = Symbol('invalid-base-dir');

/** BR-10 — base_dir wins over the deprecated workspace_root alias; '' → absent. */
function extractBaseDir(input: ResolvePathInput): string | undefined | typeof INVALID_BASE_DIR {
  for (const candidate of [input.baseDir, input.workspaceRoot]) {
    if (candidate === undefined) continue;
    if (typeof candidate !== 'string') return INVALID_BASE_DIR;
    if (candidate.trim() === '') continue; // TC-401 — empty/whitespace → absent
    return candidate;
  }
  return undefined;
}

/** Handler-side presence check (C-3): base_dir/workspace_root → resolver; otherwise the legacy path stays byte-for-byte. */
export function hasBaseDirArg(args: Record<string, unknown>): boolean {
  return args['base_dir'] !== undefined || args['workspace_root'] !== undefined;
}

/** Existence + is-directory check (BR-06) — stat errors map to FS_ERROR. */
function isDirectory(baseDir: string): boolean {
  try {
    return fs.statSync(baseDir).isDirectory();
  } catch {
    return false;
  }
}

/** T3 — realpath the deepest existing ancestor + containment re-check; returns the escaped real path or null. */
export function symlinkEscape(root: string, resolvedPath: string): string | null {
  try {
    let cursor = resolvedPath;
    while (cursor !== path.dirname(cursor) && !fs.existsSync(cursor)) {
      cursor = path.dirname(cursor);
    }
    if (!fs.existsSync(cursor)) return null;
    const real = fs.realpathSync(cursor);
    return containsFolded(root, real) ? null : real;
  } catch {
    return null; // best-effort — string containment already passed
  }
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

function err(
  code: PathResolutionErr['code'], detail: string, effectiveRoot: string, resolvedPath: string,
): PathResolutionErr {
  return { ok: false, code, message: `${code}: ${detail}`, effectiveRoot, resolvedPath };
}
