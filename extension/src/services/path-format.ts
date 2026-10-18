/**
 * path-format — shared message builders for path resolution failures.
 * (SA4E-356): Format-1 templates kept in ONE place (M-4-style anti-drift)
 * so the 6 call sites never re-implement the wording.
 * Pure string ops — NO I/O, NEVER throws (C-1, C-2).
 */
import type { PathResolutionOk } from "./PathResolver";

/** Sanitize a path/value before interpolating into messages or logs (SEC-05). */
export function sanitizeLogText(value: string): string {
  return value.replace(/[\r\n\0]/g, "?");
}

/** Format 1 — ENOENT after a correct resolve (built at TOOL layer, never helper). */
export function formatFileNotFound(resolution: PathResolutionOk): string {
  const cleanPath = sanitizeLogText(resolution.resolvedPath);
  const cleanRoot = sanitizeLogText(resolution.rootPath);
  if (resolution.rootSource === "workspace") {
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
