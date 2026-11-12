/**
 * Path guard (SECURITY-REVIEW C3) — workspace containment for the design gate.
 * The workspace root is passed explicitly by callers (SEC-F08);
 * getWorkspaceRoot() is only the env/cwd fallback for callers that do not.
 */
import * as path from "path";
import { isPathWithinRoot } from "../services/PathResolver";
import { EnvConfig } from "./types";

/**
 * Whether `filePath` resolves inside `workspaceRoot`.
 * SEC-F07: one containment implementation (PathResolver) — no startsWith.
 */
export function validateFilePath(filePath: string, workspaceRoot: string): boolean {
  return isPathWithinRoot(workspaceRoot, path.resolve(workspaceRoot, filePath));
}

/**
 * Fallback workspace root: env (EnvConfig.WORKSPACE_ROOT) else process.cwd().
 * Pipeline code receives the root explicitly and never needs this.
 */
export function getWorkspaceRoot(): string {
  const envRoot = process.env[EnvConfig.WORKSPACE_ROOT];
  return envRoot && envRoot.length > 0 ? envRoot : process.cwd();
}

/**
 * Quick containment check before file operations.
 * @param workspaceRoot - explicit root; defaults to the env/cwd fallback
 */
export function isPathSafe(filePath: string, workspaceRoot: string = getWorkspaceRoot()): boolean {
  try {
    return validateFilePath(filePath, workspaceRoot);
  } catch {
    return false;
  }
}
