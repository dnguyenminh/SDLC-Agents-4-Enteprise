/**
 * SA4E-394 — Path-resolution contract shared by the multi-worktree resolver.
 *
 * Error-as-value (mirrors extension/src/services/PathResolver.ts, C-1/C-2):
 * resolvers NEVER throw on business paths — they return a discriminated union
 * and handlers check `.ok` first. Error messages carry the machine-readable
 * `CODE:` prefix and are forwarded VERBATIM by tool handlers (C-5).
 */

/** Business error codes — FSD §3.1.6 (BR-05/06/07, AF-1). */
export type PathErrorCode =
  | 'PATH_REJECTED_OUTSIDE_ALLOWLIST'  // base_dir not registered; or resolved path escapes effective root
  | 'PATH_REJECTED_OUTSIDE_WORKSPACE'  // LEGACY: base_dir omitted, path escapes pinned root (BR-03)
  | 'FS_ERROR';                        // base_dir missing/not-dir; OS permission failures

export interface PathResolutionOk {
  ok: true;
  /** Absolute path — the ONLY path a handler may touch. */
  resolvedPath: string;
  /** base_dir (normalized) or legacy pinned root. */
  effectiveRoot: string;
  rootSource: 'base_dir' | 'legacy';
}

export interface PathResolutionErr {
  ok: false;
  code: PathErrorCode;
  /** Full 'CODE: message' text — forwarded VERBATIM by handlers. */
  message: string;
  effectiveRoot: string;
  /** Best-effort resolved path (may be '') for audit logs (FSD §7.3). */
  resolvedPath: string;
}

/** Discriminated union — callers MUST check `.ok` first. */
export type PathResolutionResult = PathResolutionOk | PathResolutionErr;

/**
 * Strip control characters from a path before echoing it in an error message
 * or log line (TDD §7.4/T6 — anti log-forging; pattern of drawio-tool.ts).
 */
export function sanitizePathText(value: string): string {
  return String(value ?? '').replace(/[\r\n\0]/g, '?');
}
