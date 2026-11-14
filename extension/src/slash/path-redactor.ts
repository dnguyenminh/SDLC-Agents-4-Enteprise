/**
 * SA4E-393 SEC-F03 — single path redactor shared by the slash pipeline and the
 * design-gate tool layer (tool layer imports this; no duplicated regex).
 * Strips the workspace root and any other absolute path from free text so
 * neither tool responses nor host logs leak filesystem layout.
 */

/** Regex source matching `root` with either separator, any run of separators. */
function rootPattern(root: string): string {
  return root
    .split(/[\\/]+/)
    .map((seg) => seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\\\/]+");
}

// Drive-letter path (C:\a\b, C:/a/b) up to whitespace/quote.
const WINDOWS_ABS = /[A-Za-z]:[\\/][^\s'"`<>|*?]*/g;
// POSIX absolute path; the lookbehind skips URLs, relative "a/b" and "<workspace>/x".
const POSIX_ABS = /(?<![\w.:/<>-])\/(?:[\w.@~+-]+\/)*[\w.@~+-]+/g;

/**
 * Replace the workspace root with `<workspace>` and every remaining absolute
 * path with `<path>`.
 * @param text - free text (error message, stack)
 * @param root - workspace root to redact first (optional)
 */
export function redactPaths(text: string, root?: string): string {
  let out = text;
  if (root) {
    const flags = process.platform === "win32" ? "gi" : "g";
    out = out.replace(new RegExp(rootPattern(root), flags), "<workspace>");
  }
  return out.replace(WINDOWS_ABS, "<path>").replace(POSIX_ABS, "<path>");
}

/** Console level used by {@link logRedacted}. */
export type LogLevel = "error" | "warn" | "log";

/**
 * Single logging choke point for the slash pipeline (SEC-F03): every host log
 * line is path-redacted before it reaches the console.
 * @param level - console method
 * @param text - message (may embed node error text with absolute paths)
 * @param root - workspace root to redact first (optional)
 */
export function logRedacted(level: LogLevel, text: string, root?: string): void {
  console[level](redactPaths(text, root));
}
