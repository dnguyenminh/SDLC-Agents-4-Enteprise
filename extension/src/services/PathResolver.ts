/**
 * PathResolver — workspace path resolution single source of truth
 * (SA4E-356): validate → root (per-call) → resolve → containment → result.
 * Pure string ops — NO I/O, NEVER throws (C-1, C-2).
 */
import * as path from "path";
import { sanitizeLogText } from "./path-format";

// ── Types (TDD §3.2) ────────────────────────────────────────────────────

/** Resolution origin — in error messages on failure (BR-08). */
export type PathRootSource = "workspace" | "cwd_fallback";

/** Workspace root AT CALL TIME — never cached (UC-01 AF-2). */
export type WorkspaceRootProvider = () => string | undefined;

/** Machine-readable error codes (TDD §7.1) — `CODE:` prefix in message. */
export type PathResolutionCode =
  | "PATH_EMPTY"
  | "PATH_INVALID"
  | "PATH_NO_WORKSPACE"
  | "PATH_REJECTED_OUTSIDE_WORKSPACE";

export interface PathResolutionOk {
  ok: true;
  /** Absolute path after resolve + containment — use for EVERY fs.* call. */
  resolvedPath: string;
  rootSource: PathRootSource;
  /** Workspace root OR process.cwd() — in failure messages (BR-08). */
  rootPath: string;
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
  "Relative paths resolve against the primary workspace folder; absolute paths " +
  "pass through; paths outside the workspace root are rejected.";

// ── vscode lazy-require (pattern proven backend-local-tools.ts:14–15) ────
// NOTE: `require("vscode")` is unresolvable outside the extension host
// (vitest alias mock is import-only). The root-selection LOGIC this feeds is
// fully covered via mock-backed providers in path-resolver.test.ts.
/* v8 ignore start */
let vscode: any;
try {
  vscode = require("vscode");
} catch {
  /* stay undefined — fallback cwd */
}

export function defaultWorkspaceRootProvider(): string | undefined {
  try {
    return vscode?.workspace?.workspaceFolders?.[0]?.uri?.fsPath; // per-call, no cache
  } catch {
    return undefined; // UC-05 EF-2
  }
}
/* v8 ignore stop */

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
  opts?: { rootProvider?: WorkspaceRootProvider },
): PathResolutionResult {
  // Step 1 — validate (UC-01 EF-3): fail-loud BEFORE resolving.
  if (typeof rawPath !== "string" || rawPath.trim() === "") {
    return {
      ok: false,
      code: "PATH_EMPTY",
      message: "PATH_EMPTY: 'file_path' must be a non-empty string.",
      rawPath: typeof rawPath === "string" ? rawPath : String(rawPath ?? ""),
      resolvedPath: "",
      rootSource: null,
      rootPath: "",
    };
  }
  // SEC-05 (AD-19): NUL → PATH_INVALID (fs.* would throw prefix-less — E-1).
  if (rawPath.includes("\0")) {
    return {
      ok: false,
      code: "PATH_INVALID",
      message: "PATH_INVALID: 'file_path' contains invalid characters (NUL byte).",
      rawPath: sanitizeLogText(rawPath), // sanitize — anti log-forging (§10.1)
      resolvedPath: "",
      rootSource: null,
      rootPath: "",
    };
  }
  const trimmed = rawPath.trim();

  // Step 2 — root + rootSource (BR-02, BR-06; provider per-call — C-3).
  const provider = opts?.rootProvider ?? defaultWorkspaceRootProvider;
  let rootPath: string | undefined;
  try {
    rootPath = provider();
  } catch {
    rootPath = undefined;
  }
  let rootSource: PathRootSource;
  if (rootPath && rootPath.trim() !== "") {
    rootSource = "workspace";
  } else {
    rootPath = process.cwd(); // BR-06 fallback
    rootSource = "cwd_fallback";
  }

  // Step 2b — SEC-02 (BR-06b, AD-16): reject relative on cwd_fallback.
  if (rootSource === "cwd_fallback" && !path.isAbsolute(trimmed)) {
    const cleanRaw = sanitizeLogText(trimmed);
    return {
      ok: false,
      code: "PATH_NO_WORKSPACE",
      message:
        "PATH_NO_WORKSPACE: no workspace open — use an absolute path inside the " +
        `intended folder or open a workspace. (got relative '${cleanRaw}', ` +
        `fallback root ${rootPath})`,
      rawPath: cleanRaw,
      resolvedPath: "",
      rootSource,
      rootPath,
    };
  }

  // Step 3 — resolve (BR-02, BR-03; path.resolve normalizes — UC-02 EF-3).
  const resolvedPath = path.isAbsolute(trimmed)
    ? path.resolve(trimmed) // absolute passthrough (BR-03)
    : path.resolve(rootPath, trimmed); // relative → root (BR-02)

  // Step 4 — containment (BR-04, BR-05) — ONLY for a real workspace root.
  // DISC-1 RESOLVED: none on cwd_fallback (intentional, BA-acked BRD v1.0.1
  // §1.5) — see TDD §8.2 + FSD v1.2 §6.3 Note.
  if (rootSource === "workspace" && !isPathWithinRoot(rootPath, resolvedPath)) {
    return {
      ok: false,
      code: "PATH_REJECTED_OUTSIDE_WORKSPACE",
      message:
        `PATH_REJECTED_OUTSIDE_WORKSPACE: Path rejected: ${sanitizeLogText(trimmed)} resolves to ` +
        `${sanitizeLogText(resolvedPath)} — outside workspace root ${sanitizeLogText(rootPath)}.`,
      rawPath: trimmed,
      resolvedPath,
      rootSource,
      rootPath,
    };
  }

  // Step 5 — success.
  return { ok: true, resolvedPath, rootSource, rootPath };
}

// ── Containment (TDD §3.3) ───────────────────────────────────────────────
export function isPathWithinRoot(root: string, candidate: string): boolean {
  const sep = path.sep;
  const rootNorm = path.normalize(root);
  const rootWithSep = rootNorm.endsWith(sep) ? rootNorm : rootNorm + sep; // UC-03 EF-2
  const candNorm = path.normalize(candidate);
  const fold = (p: string): string =>
    process.platform === "win32" ? p.toLowerCase() : p; // BR-04
  return (
    fold(candNorm).startsWith(fold(rootWithSep)) || fold(candNorm) === fold(rootNorm)
  );
}

// ── Shared Format-1 builders — extracted to path-format.ts (BR-18);
// re-exported here so public symbols stay at this path.
export {
  sanitizeLogText,
  formatFileNotFound,
  formatFsError,
} from "./path-format";
