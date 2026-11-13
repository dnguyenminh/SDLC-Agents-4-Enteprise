/**
 * PathResolver — workspace path resolution single source of truth
 * (SA4E-356): validate → root (per-call) → resolve → containment → result.
 * Pure string ops — NO I/O, NEVER throws (C-1, C-2).
 *
 * SA4E-406 F2/A6/A8: optional multi-root candidate selection — a bound
 * session root (containment gate, first) and `rootCandidates` (ordered,
 * first = preferred; the CALLER decides whether its provider probes fs
 * existence) are iterated BEFORE the legacy folders[0] fallback. vscode
 * access lives in workspace-roots.ts, containment in path-containment.ts,
 * candidate logic in root-candidates.ts, error builders in path-format.ts
 * (200-line budget) — all re-exported here so public symbols stay put.
 */
import * as path from "path";
import {
  INVALID_BASE_DIR,
  pickBaseDir,
  resolveWithBaseDir,
} from "./base-dir-resolution";
import {
  emptyPathError,
  invalidPathError,
  noWorkspaceError,
  outsideWorkspaceError,
} from "./path-format";
import {
  resolveViaCandidates,
  sessionGateHit,
  type RootCandidatesProvider,
} from "./root-candidates";
import { isPathWithinRoot } from "./path-containment";
import { selectWorkspaceRoot } from "./workspace-roots";

// ── Types (TDD §3.2) ────────────────────────────────────────────────────

/**
 * Resolution origin — in error messages on failure (BR-08).
 * SA4E-406 adds `workspace_candidate` (F2) and `session` (A6) — add-only,
 * existing consumers keep working.
 */
export type PathRootSource =
  | "workspace"
  | "workspace_candidate"
  | "session"
  | "cwd_fallback";

/** Workspace root AT CALL TIME — never cached (UC-01 AF-2). */
export type WorkspaceRootProvider = () => string | undefined;

/** SA4E-406 F2 — ordered candidate roots (first = preferred). */
export type { RootCandidatesProvider };

/** Machine-readable error codes (TDD §7.1) — `CODE:` prefix in message. */
export type PathResolutionCode =
  | "PATH_EMPTY"
  | "PATH_INVALID"
  | "PATH_NO_WORKSPACE"
  // SA4E-406 F3 — wrapper-level (Base64ProxyService): a relative path probed
  // against the candidate roots was found under NONE of them.
  | "PATH_NO_CANDIDATE"
  | "PATH_REJECTED_OUTSIDE_WORKSPACE"
  // SA4E-394 — base_dir not in the allowlist, or resolved path escapes the
  // effective root (same code as the backend multi-worktree resolver).
  | "PATH_REJECTED_OUTSIDE_ALLOWLIST";

export interface PathResolutionOk {
  ok: true;
  /** Absolute path after resolve + containment — use for EVERY fs.* call. */
  resolvedPath: string;
  rootSource: PathRootSource;
  /** Workspace root OR process.cwd() — in failure messages (BR-08). */
  rootPath: string;
  /** SA4E-406 F2 — index into the candidate list when candidate-resolved. */
  candidateIndex?: number;
  /** SA4E-406 F2/F5 — candidate roots considered during this resolution. */
  candidatesProbed?: string[];
}

export interface PathResolutionErr {
  ok: false;
  code: PathResolutionCode;
  /** Complete message with CODE: prefix — tools forward it VERBATIM (C-5). */
  message: string;
  rawPath: string;
  /** Best-effort resolved path (audit log §8.5). */
  resolvedPath: string;
  rootSource: PathRootSource | null;
  rootPath: string;
}

/** Discriminated union — callers MUST check `.ok` before reading other fields. */
export type PathResolutionResult = PathResolutionOk | PathResolutionErr;

// ── Shared schema text (M-4 — anti-drift between static + rewrite path) ──
export const FILE_PATH_SCHEMA_DESCRIPTION =
  "Relative paths resolve against the bound MCP session workspace root (if the client declared one " +
  "at initialize), else the first workspace folder; multi-root workspaces pick the first folder " +
  "containing the file. Absolute paths pass through; paths outside the workspace root are rejected.";

// Extracted modules (SA4E-406) — re-exported so public symbols stay at this path.
export { defaultWorkspaceRootProvider } from "./workspace-roots";
export { isPathWithinRoot } from "./path-containment";

// ── Throw-path error type (Base64ProxyService delegation — TDD §5.5) ─────
export class PathResolverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathResolverError";
  }
}

// ── Core API ─────────────────────────────────────────────────────────────
export function resolveWorkspacePath(
  rawPath: unknown,
  opts?: {
    rootProvider?: WorkspaceRootProvider,
    /** SA4E-406 F2 — ordered candidate roots; caller may probe existence. */
    rootCandidates?: RootCandidatesProvider,
    /** SA4E-406 A6/A8(1) — bound MCP session root (containment gate first). */
    sessionRoot?: string,
    /** SA4E-394 — per-call workspace root (alias: workspaceRoot). */
    baseDir?: unknown,
    workspaceRoot?: unknown,
    /** SA4E-394 — extension allowlist mirror (default: settings/env). */
    allowlist?: ReadonlySet<string>,
  },
): PathResolutionResult {
  // SA4E-394 — a per-call base_dir/workspace_root becomes the EFFECTIVE root:
  // same normative pipeline (normalize → allowlist → resolve → containment).
  const baseDir = pickBaseDir(opts);
  if (baseDir === INVALID_BASE_DIR) {
    return {
      ok: false,
      code: "PATH_REJECTED_OUTSIDE_ALLOWLIST",
      message: "PATH_REJECTED_OUTSIDE_ALLOWLIST: base_dir must be a non-empty string workspace root.",
      rawPath: "",
      resolvedPath: "",
      rootSource: null,
      rootPath: "",
    };
  }
  if (baseDir !== undefined) {
    return resolveWithBaseDir(rawPath, baseDir, { allowlist: opts?.allowlist, sessionRoot: opts?.sessionRoot });
  }
  // Step 1 — validate (UC-01 EF-3): fail-loud BEFORE resolving.
  if (typeof rawPath !== "string" || rawPath.trim() === "") return emptyPathError(rawPath);
  if (rawPath.includes("\0")) return invalidPathError(rawPath); // SEC-05 (AD-19)
  const trimmed = rawPath.trim();

  // SA4E-406 A8 — session gate + folder candidates apply to RELATIVE paths
  // only; absolute paths keep the legacy containment semantics unchanged.
  if (!path.isAbsolute(trimmed)) {
    // Step 2s — A6/A8(1): the bound session root is the FIRST candidate
    // (containment gate, no existence probe — new-file writes land here).
    if (typeof opts?.sessionRoot === "string") {
      const gate = sessionGateHit(trimmed, opts.sessionRoot);
      if (gate) return gate;
    }
    // Step 2a — F2/A8(2): probed folder candidates; first containment wins.
    const viaCandidates = resolveViaCandidates(trimmed, opts?.rootCandidates, opts?.sessionRoot);
    if (viaCandidates) return viaCandidates;
  }

  // Step 2 — root + rootSource (BR-02, BR-06; provider per-call — C-3).
  const selected = selectWorkspaceRoot(opts?.rootProvider);
  const rootPath = selected.rootPath;
  const rootSource = selected.rootSource;

  // Step 2b — SEC-02 (BR-06b, AD-16): reject relative on cwd_fallback.
  if (rootSource === "cwd_fallback" && !path.isAbsolute(trimmed)) {
    return noWorkspaceError(trimmed, rootPath);
  }

  // Step 3 — resolve (BR-02, BR-03; path.resolve normalizes — UC-02 EF-3).
  const resolvedPath = path.isAbsolute(trimmed)
    ? path.resolve(trimmed) // absolute passthrough (BR-03)
    : path.resolve(rootPath, trimmed); // relative → root (BR-02)

  // Step 4 — containment (BR-04, BR-05) — ONLY for a real workspace root.
  // DISC-1 RESOLVED: none on cwd_fallback (intentional, BA-acked BRD v1.0.1
  // §1.5) — see TDD §8.2 + FSD v1.2 §6.3 Note.
  if (rootSource === "workspace" && !isPathWithinRoot(rootPath, resolvedPath)) {
    return outsideWorkspaceError(trimmed, resolvedPath, rootPath);
  }

  // Step 5 — success.
  return { ok: true, resolvedPath, rootSource, rootPath };
}

// ── Shared Format-1 builders — extracted to path-format.ts (BR-18);
// re-exported here so public symbols stay at this path.
export {
  sanitizeLogText,
  formatFileNotFound,
  formatFsError,
} from "./path-format";
