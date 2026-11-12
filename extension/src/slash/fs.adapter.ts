/**
 * File System Adapter — facade for workspace-scoped static source access
 * (SECURITY-REVIEW C3: nothing outside the workspace root is ever read).
 * Containment lives in path-guard.ts, directory walking in file-lister.ts.
 */
import * as fs from "fs";
import * as path from "path";
import { DetectionError, createDetectionError } from "./types";
import { validateFilePath } from "./path-guard";

export { getWorkspaceRoot, isPathSafe } from "./path-guard";
export { listSourceFiles } from "./file-lister";
export type { ListOptions } from "./file-lister";

/**
 * Read a source file's content from the workspace (path validated per C3).
 * @param filePath - Relative path from workspace root
 * @param workspaceRoot - The workspace root directory
 * @throws DetectionError.INVALID_PATH if the path escapes, is missing or unreadable
 */
export function readSourceFile(filePath: string, workspaceRoot: string): string {
  if (!validateFilePath(filePath, workspaceRoot)) {
    throw createDetectionError(DetectionError.INVALID_PATH, `File path escapes workspace root: ${filePath}`);
  }
  const resolvedPath = path.resolve(workspaceRoot, filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw createDetectionError(DetectionError.INVALID_PATH, `File does not exist: ${filePath}`);
  }
  try {
    return fs.readFileSync(resolvedPath, "utf-8");
  } catch (error: any) {
    throw createDetectionError(DetectionError.INVALID_PATH, `Failed to read file ${filePath}: ${error.message}`);
  }
}

// Export the enum for use in tests
export { DetectionError };
