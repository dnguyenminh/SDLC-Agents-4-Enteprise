/**
 * TimestampResolver — Resolves file timestamps with priority:
 * git last commit time → fs modified time → Date.now()
 *
 * SEC-07: Uses execFile (array args, no shell) to prevent command injection.
 */

import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { ITimestampResolver } from "./models";

/** Shell metacharacter pattern — reject paths with dangerous chars */
const SHELL_META_PATTERN = /[;&|`$(){}[\]!#~<>*?\n\r\0]/;

export class TimestampResolver implements ITimestampResolver {
  /**
   * Resolve timestamp for a file.
   * Priority: git log → fs.stat mtime → Date.now()
   */
  async resolve(filePath: string, workspaceRoot: string): Promise<string> {
    if (!this.isPathSafe(filePath)) {
      return this.resolveFromFs(filePath, workspaceRoot);
    }
    const gitTime = await this.resolveFromGit(filePath, workspaceRoot);
    if (gitTime) { return gitTime; }
    return this.resolveFromFs(filePath, workspaceRoot);
  }

  /** SEC-07: Validate filename has no shell metacharacters */
  private isPathSafe(filePath: string): boolean {
    if (SHELL_META_PATTERN.test(filePath)) { return false; }
    if (filePath.includes("..")) { return false; }
    return true;
  }

  /** SEC-07: execFile with array args — no shell interpolation */
  private resolveFromGit(filePath: string, cwd: string): Promise<string | null> {
    return new Promise((resolve) => {
      execFile(
        "git",
        ["log", "-1", "--format=%aI", "--", filePath],
        { cwd, timeout: 5000 },
        (err, stdout) => {
          if (err || !stdout.trim()) { resolve(null); return; }
          resolve(stdout.trim());
        }
      );
    });
  }

  /** Fallback: fs.stat mtime → Date.now() */
  private async resolveFromFs(filePath: string, workspaceRoot: string): Promise<string> {
    try {
      const fullPath = path.join(workspaceRoot, filePath);
      const stat = await fs.stat(fullPath);
      return stat.mtime.toISOString();
    } catch (err) {
      console.debug(`[TimestampResolver] stat failed, using current time (non-fatal): ${(err as Error).message}`);
      return new Date().toISOString();
    }
  }
}

