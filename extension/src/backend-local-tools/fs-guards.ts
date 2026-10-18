/**
 * Filesystem safety guards for local tool execution.
 * Extracted from backend-local-tools.ts (BR-18 file-size limit).
 */
import * as fs from "fs";
import * as path from "path";
import { isPathWithinRoot, sanitizeLogText, type PathResolutionOk } from "../services/PathResolver";

/**
 * I-7 parent-dir realpath guard (TDD §3.7 step 3.5, SEC-03/AD-17).
 * Re-checks the lexical containment against the REAL parent directory to
 * close symlink/junction/subst escapes. Realpaths the PARENT only — never
 * the file itself — so writing NEW files keeps working.
 * Callers: run AFTER ensureDir for writes (parent must exist to realpath),
 * BEFORE any fs.* touch. Returns an error message, or null when clean.
 * Skipped entirely when rootSource is cwd_fallback (no boundary there).
 */
export function checkSymlinkGuard(
  resolution: PathResolutionOk,
  rawDisplay: string,
): string | null {
  if (resolution.rootSource !== "workspace") return null;
  const parentDir = path.dirname(resolution.resolvedPath);
  let realParent: string;
  try {
    realParent = fs.realpathSync(parentDir);
  } catch (err: any) {
    return `FS_ERROR: Failed to resolve parent dir ${sanitizeLogText(parentDir)}: ${sanitizeLogText(err?.message ?? String(err))}`;
  }
  const realCandidate = path.join(realParent, path.basename(resolution.resolvedPath));
  if (!isPathWithinRoot(resolution.rootPath, realCandidate)) {
    return (
      `PATH_REJECTED_OUTSIDE_WORKSPACE: Path rejected: ${sanitizeLogText(rawDisplay)} resolves to ` +
      `${sanitizeLogText(resolution.resolvedPath)} — outside workspace root ` +
      `${sanitizeLogText(resolution.rootPath)} via symlink/junction.`
    );
  }
  return null;
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
