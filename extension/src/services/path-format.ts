/**
 * path-format — shared message builders for path resolution failures.
 * (SA4E-356): Format-1 templates kept in ONE place (M-4-style anti-drift)
 * so the call sites never re-implement the wording.
 * SA4E-406: the typed PathResolutionErr builders moved here from
 * PathResolver.ts (200-line budget); messages are byte-identical to the
 * pre-extraction literals — existing verbatim assertions stay green.
 * Pure string ops — NO I/O, NEVER throws (C-1, C-2).
 */
import type { PathResolutionErr, PathResolutionOk } from "./PathResolver";

/** Sanitize a path/value before interpolating into messages or logs (SEC-05). */
export function sanitizeLogText(value: string): string {
  return value.replace(/[\r\n\0]/g, "?");
}

/** Typed PATH_EMPTY error (Step 1 — fail loud BEFORE resolving, UC-01 EF-3). */
export function emptyPathError(rawPath: unknown): PathResolutionErr {
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

/** Typed PATH_INVALID error (SEC-05/AD-19 — NUL byte, prefix-less fs throw E-1). */
export function invalidPathError(rawPath: string): PathResolutionErr {
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

/** Format 3 — relative path on cwd_fallback (BR-06b, UT-11 message lock). */
export function noWorkspaceError(trimmed: string, rootPath: string): PathResolutionErr {
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
    rootSource: "cwd_fallback",
    rootPath,
  };
}

/** Format 2 — resolved path escapes the workspace root (BR-04/BR-05). */
export function outsideWorkspaceError(
  trimmed: string,
  resolvedPath: string,
  rootPath: string,
): PathResolutionErr {
  return {
    ok: false,
    code: "PATH_REJECTED_OUTSIDE_WORKSPACE",
    message:
      `PATH_REJECTED_OUTSIDE_WORKSPACE: Path rejected: ${sanitizeLogText(trimmed)} resolves to ` +
      `${sanitizeLogText(resolvedPath)} — outside workspace root ${sanitizeLogText(rootPath)}.`,
    rawPath: trimmed,
    resolvedPath,
    rootSource: "workspace",
    rootPath,
  };
}

/** Format 1 — ENOENT after a correct resolve (built at TOOL layer, never helper). */
export function formatFileNotFound(resolution: PathResolutionOk): string {
  const cleanPath = sanitizeLogText(resolution.resolvedPath);
  const cleanRoot = sanitizeLogText(resolution.rootPath);
  // SA4E-406: session/candidate roots are workspace-anchored — use the
  // workspace wording (the old `=== "workspace"` check mislabeled them).
  if (resolution.rootSource !== "cwd_fallback") {
    return (
      `FILE_NOT_FOUND: File not found: ${cleanPath}. ` +
      `Resolved against workspace root ${cleanRoot}. ` +
      "Gợi ý: dùng absolute path (nằm trong workspace root) hoặc kiểm tra lại " +
      "đường dẫn tương đối tính từ workspace root."
    );
  }
  return (
    `FILE_NOT_FOUND: File not found: ${cleanPath}. ` +
    `Resolved against process.cwd() fallback = ${cleanRoot}. ` +
    "Gợi ý: mở workspace hoặc dùng absolute path trong workspace root."
  );
}

/** Format 1 variant — non-ENOENT fs errors (UC-04 EF-1). */
export function formatFsError(
  operation: string,
  resolution: PathResolutionOk,
  err: unknown,
): string {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    `FS_ERROR: Failed ${operation} ${sanitizeLogText(resolution.resolvedPath)}: ` +
    sanitizeLogText(msg)
  );
}
