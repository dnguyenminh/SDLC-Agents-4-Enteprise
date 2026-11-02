/**
 * SA4E-394 SEC-01 — containment gate for the LEGACY (base_dir-omitted) read
 * branch of call sites that must keep their legacy code path byte-for-byte
 * otherwise (C-3, e.g. the mem_ingest_file ingest-file handler).
 *
 * The base_dir branch routes through MultiWorktreePathResolver and is fully
 * contained; the legacy branch historically accepted ANY existing host path
 * (SEC-01 CWE-22 — an arbitrary-file-read primitive). This gate reuses the
 * resolver's own primitives (T5/T9 case-folded containment + T3 symlink
 * anti-escape, exported from multi-worktree-path-resolver.ts) to enforce:
 *   - relative inputs → the pinned legacy workspace root, via the shared
 *     `resolveWithinWorkspace` helper (same function the resolver legacy
 *     branch uses — identical legacy semantics, traversal + NUL rejected);
 *   - absolute inputs → pinned root first, then each configured allowlist
 *     root (legacy clients keep cross-worktree reads; containment + T3 hold);
 *   - anything else → rejected with the base_dir branch's typed error and
 *     its containment message verbatim (AC2 wording, BR-23 zero side effects).
 *
 * Error-as-value: never throws on business paths (§1.4).
 */
import * as path from 'path';
import { containsFolded, symlinkEscape } from './multi-worktree-path-resolver.js';
import { resolveWithinWorkspace } from './path-safety.js';
import {
  sanitizePathText,
  type PathResolutionErr,
  type PathResolutionResult,
} from './path-resolution-types.js';

export interface LegacyReadGateInput {
  /** The call site's pinned legacy workspace root (BR-03 / C-3). */
  readonly pinnedRoot: string;
  /** Configured allowlist roots (MultiWorktreePathResolver.allowlistRoots()). */
  readonly allowlistRoots: readonly string[];
  /** `file_path` exactly as received — non-string/NUL handled inside. */
  readonly filePath: unknown;
}

/** Resolve a legacy (base_dir-omitted) read with full containment. */
export function resolveLegacyRead(input: LegacyReadGateInput): PathResolutionResult {
  const pinned = path.resolve(input.pinnedRoot);
  if (typeof input.filePath === 'string' && input.filePath.trim() !== '' && !input.filePath.includes('\0')) {
    const trimmed = input.filePath.trim();
    if (!path.isAbsolute(trimmed)) {
      // Legacy relative semantics — a shared path-safety helper, byte-for-byte
      // equivalent to the resolver's own legacy branch (BR-02/BR-03).
      const within = resolveWithinWorkspace(pinned, trimmed);
      if (within !== null) {
        return { ok: true, resolvedPath: within, effectiveRoot: pinned, rootSource: 'legacy' };
      }
      return containmentReject(pinned, path.resolve(pinned, trimmed));
    }
    const resolved = path.resolve(trimmed); // BR-09 — normalize before containment
    const candidates = [pinned, ...input.allowlistRoots];
    for (const root of candidates) {
      const base = path.resolve(root);
      if (!containsFolded(base, resolved)) continue;
      const escape = symlinkEscape(base, resolved); // T3 — same guard as base_dir
      if (escape !== null) return containmentReject(base, escape);
      return { ok: true, resolvedPath: resolved, effectiveRoot: base, rootSource: 'legacy' };
    }
    return containmentReject(pinned, resolved);
  }
  return rejection(
    typeof input.filePath === 'string' && input.filePath.includes('\0')
      ? 'file_path contains invalid characters (NUL byte)'
      : 'file_path must be a non-empty string',
    pinned,
  );
}

/** Same message template as MultiWorktreePathResolver.containmentErr — AC2 verbatim. */
function containmentReject(root: string, resolvedPath: string): PathResolutionErr {
  return rejection(
    `Resolved path '${sanitizePathText(resolvedPath)}' is outside workspace root '${sanitizePathText(root)}'`,
    root,
  );
}

function rejection(detail: string, effectiveRoot: string): PathResolutionErr {
  return { ok: false, code: 'PATH_REJECTED_OUTSIDE_ALLOWLIST', message: `PATH_REJECTED_OUTSIDE_ALLOWLIST: ${detail}`, effectiveRoot, resolvedPath: '' };
}
