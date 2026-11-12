/**
 * Source file lister — walks a directory for design artifacts only
 * (SA4E-393 Addendum: web/UI surface, not arbitrary text files).
 */
import * as fs from "fs";
import * as path from "path";
import { isPathWithinRoot } from "../services/PathResolver";
import { DetectionError, createDetectionError } from "./types";
import { getWorkspaceRoot, validateFilePath } from "./path-guard";
import { redactPaths } from "./path-redactor";

const MAX_FILES = 10000; // per TDD/DPG

// Dependency/build artifacts, not workspace source (keeps C3 scope honest).
const SKIP_DIRS = new Set([
  "node_modules", ".git", "out", "dist", "build", "coverage",
  ".code-intel", ".kiro", ".opencode", ".vscode", "resources", "webview-assets",
]);

const DESIGN_FILE_EXTENSIONS = new Set([
  ".html", ".htm", ".css", ".scss", ".sass", ".less", ".vue", ".svelte", ".tsx", ".jsx",
]);

/** Options for {@link listSourceFiles}. */
export interface ListOptions {
  maxFiles?: number;
  /** Explicit workspace root (SEC-F08); defaults to env/cwd fallback. */
  workspaceRoot?: string;
}

interface WalkState { root: string; max: number; files: string[] }

function isDesignArtifact(fileName: string): boolean {
  return DESIGN_FILE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

/** Add a design artifact to the result if it is inside the workspace. */
function collectFile(fullPath: string, state: WalkState): void {
  if (!isPathWithinRoot(state.root, fullPath)) return; // C3: skip anything outside
  state.files.push(path.relative(state.root, fullPath));
}

/** Read a sub-directory; an unreadable one is logged (path-redacted) and skipped. */
function readSubDir(dir: string, root: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    console.error(redactPaths(`Skipping unreadable directory: ${(error as Error).message}`, root));
    return [];
  }
}

function walk(dir: string, entries: fs.Dirent[], state: WalkState): void {
  for (const entry of entries) {
    if (state.files.length >= state.max) return;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      walk(fullPath, readSubDir(fullPath, state.root), state);
    } else if (entry.isFile() && isDesignArtifact(entry.name)) {
      collectFile(fullPath, state);
    }
  }
}

/** Reject a sourceRoot that escapes the workspace or does not exist. */
function assertListable(sourceRoot: string, root: string): void {
  if (!validateFilePath(sourceRoot, root)) {
    throw createDetectionError(DetectionError.INVALID_PATH,
      `Source path does not exist or escapes workspace root: ${sourceRoot}`);
  }
  if (!fs.existsSync(sourceRoot)) {
    throw createDetectionError(DetectionError.INVALID_PATH, `Source path does not exist: ${sourceRoot}`);
  }
  assertRealPathInside(sourceRoot, root);
}

/** S-2: fail closed when sourceRoot (via symlink/junction) really lives outside the workspace. */
function assertRealPathInside(sourceRoot: string, root: string): void {
  let inside = false;
  try {
    inside = isPathWithinRoot(fs.realpathSync(root), fs.realpathSync(sourceRoot));
  } catch {
    inside = false; // cannot resolve → cannot prove containment
  }
  if (!inside) {
    throw createDetectionError(DetectionError.INVALID_PATH, "Source path resolves outside workspace root");
  }
}

/**
 * List design artifacts under `sourceRoot` (workspace-relative paths).
 * @throws DetectionError.INVALID_PATH if sourceRoot escapes the workspace / cannot be read
 */
export async function listSourceFiles(sourceRoot: string, options: ListOptions = {}): Promise<string[]> {
  const root = options.workspaceRoot ?? getWorkspaceRoot();
  assertListable(sourceRoot, root);
  const state: WalkState = { root, max: options.maxFiles ?? MAX_FILES, files: [] };
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(sourceRoot, { withFileTypes: true });
  } catch (error: any) {
    throw createDetectionError(DetectionError.INVALID_PATH, `Failed to list source files: ${error.message}`);
  }
  walk(sourceRoot, entries, state);
  return state.files.slice(0, state.max);
}
