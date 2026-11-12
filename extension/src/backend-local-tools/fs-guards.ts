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
 * Skipped entirely when rootSource is cwd_fallback (no boundary there) —
 * every workspace-anchored origin (workspace, workspace_candidate, session)
 * IS guarded (A7: the guards still apply INSIDE an admitted root).
 */
export function checkSymlinkGuard(
  resolution: PathResolutionOk,
  rawDisplay: string,
): string | null {
  if (resolution.rootSource === "cwd_fallback") return null;
  return checkSymlinkGuardForPath(
    resolution.resolvedPath,
    resolution.rootPath,
    rawDisplay,
    resolution.candidatesProbed,
  );
}

/**
 * Path-only variant (SA4E-406 M2): re-check an ALREADY-resolved path against
 * its workspace root. Lets the drawio modules guard every read/write of a run
 * (the verify loop re-writes the file several times) without threading the
 * full resolution object through the engine.
 * SA4E-406 F3: `candidatesProbed` (optional) extends the rejection with the
 * candidate roots that were probed — actionable without changing the code.
 */
export function checkSymlinkGuardForPath(
  resolvedPath: string,
  rootPath: string,
  rawDisplay: string,
  candidatesProbed?: string[],
): string | null {
  const parentDir = path.dirname(resolvedPath);
  let realParent: string;
  try {
    realParent = fs.realpathSync(parentDir);
  } catch (err: any) {
    return `FS_ERROR: Failed to resolve parent dir ${sanitizeLogText(parentDir)}: ${sanitizeLogText(err?.message ?? String(err))}`;
  }
  const realCandidate = path.join(realParent, path.basename(resolvedPath));
  if (!isPathWithinRoot(rootPath, realCandidate)) {
    return (
      `PATH_REJECTED_OUTSIDE_WORKSPACE: Path rejected: ${sanitizeLogText(rawDisplay)} resolves to ` +
      `${sanitizeLogText(resolvedPath)} — outside workspace root ` +
      `${sanitizeLogText(rootPath)} via symlink/junction.` + probedRootsHint(candidatesProbed)
    );
  }
  // F2 — file-level symlink escape: if the resolved target itself exists and is
  // a symlink, reject it (parent realpath alone doesn't catch a workspace file
  // that IS a symlink pointing outside). Non-existent paths stay ALLOWED so
  // new-file writes keep working (lstat throws ENOENT → fall through).
  try {
    if (fs.lstatSync(resolvedPath).isSymbolicLink()) {
      return (
        `PATH_REJECTED_OUTSIDE_WORKSPACE: Path rejected: ${sanitizeLogText(rawDisplay)} resolves to ` +
        `${sanitizeLogText(resolvedPath)} — outside workspace root ` +
        `${sanitizeLogText(rootPath)} via symlink/junction.` + probedRootsHint(candidatesProbed)
      );
    }
  } catch (err: any) {
    // ENOENT = path doesn't exist yet (new file) → allow. Any other fs error
    // also degrades to allow rather than blocking legitimate writes.
  }
  return null;
}

/** F3 — sanitized candidate-roots tail for rejection messages (may be ""). */
function probedRootsHint(candidatesProbed?: string[]): string {
  if (!candidatesProbed || candidatesProbed.length === 0) return "";
  const roots = candidatesProbed.map((r) => sanitizeLogText(r)).join("; ");
  return ` Candidate roots probed: ${roots}.`;
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
