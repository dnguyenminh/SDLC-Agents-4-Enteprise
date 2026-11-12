/**
 * Path guard (SECURITY-REVIEW C3) — workspace containment for the design gate.
 * The workspace root is passed explicitly by callers (SEC-F08) and is
 * required: there is no env/process.cwd() fallback.
 */
import * as path from "path";
import { isPathWithinRoot } from "../services/PathResolver";
import { DetectionError, createDetectionError } from "./types";

/**
 * Whether `filePath` resolves inside `workspaceRoot`.
 * SEC-F07: one containment implementation (PathResolver) — no startsWith.
 */
export function validateFilePath(filePath: string, workspaceRoot: string): boolean {
  return isPathWithinRoot(workspaceRoot, path.resolve(workspaceRoot, filePath));
}

/**
 * Fail loudly when a caller did not supply the workspace root.
 * WHY: silently defaulting to process.cwd() created stray `.code-intel/`
 * folders wherever the host process happened to run (SA4E-393).
 * @throws DetectionErrorException(WORKSPACE_ROOT_REQUIRED) for empty/non-string roots
 */
export function requireWorkspaceRoot(root: unknown): string {
  if (typeof root !== "string" || root.length === 0) {
    throw createDetectionError(DetectionError.WORKSPACE_ROOT_REQUIRED, "workspace root required");
  }
  return root;
}

/**
 * Quick containment check before file operations.
 * @param workspaceRoot - explicit root (required; throws when missing)
 */
export function isPathSafe(filePath: string, workspaceRoot: string): boolean {
  requireWorkspaceRoot(workspaceRoot);
  try {
    return validateFilePath(filePath, workspaceRoot);
  } catch {
    return false;
  }
}
