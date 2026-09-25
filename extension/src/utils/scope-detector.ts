import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

/**
 * Detect KB scope for a workspace based on VCS presence and branch.
 * - PROJECT: git repo exists and current branch is main/master (or Pega VCS on main)
 * - WORKSPACE: no VCS or branch is not main
 */
export function detectKbScope(workspaceRoot: string): "PROJECT" | "WORKSPACE" {
  // Check git
  const gitDir = path.join(workspaceRoot, ".git");
  if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
    try {
      const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: workspaceRoot, encoding: "utf-8" }).trim();
      if (branch === "main" || branch === "master") {
        return "PROJECT";
      }
      // Non-main branch -> workspace scope
      return "WORKSPACE";
    } catch {
      // git command failed -> treat as workspace
      return "WORKSPACE";
    }
  }

  // Check Pega version control marker (optional)
  const pegaDir = path.join(workspaceRoot, ".pega");
  if (fs.existsSync(pegaDir)) {
    // For now, assume Pega workspaces are PROJECT if marker exists
    return "PROJECT";
  }

  // No VCS detected
  return "WORKSPACE";
}

/**
 * Get effective KB scope for current workspace.
 * Falls back to WORKSPACE if no workspace folder.
 */
export function getEffectiveScope(): "PROJECT" | "WORKSPACE" {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return "WORKSPACE";
  return detectKbScope(root);
}
