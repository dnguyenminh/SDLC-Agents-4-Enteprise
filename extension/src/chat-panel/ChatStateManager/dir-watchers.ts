/**
 * ChatStateManager — workspace directory hot-reload watchers (SA4E-189).
 * One debounced FileSystemWatcher per .code-intel directory; the exact
 * per-directory log strings and 300ms debounce timing are preserved.
 */

import * as vscode from "vscode";
import { debugLog } from "../../debug-logger";

export interface DirWatcherConfig {
  workspaceRoot: string;
  dirName: string;              // directory under .code-intel/
  glob: string;                 // RelativePattern glob (relative to workspaceRoot)
  missingMessage: string;       // logged when the directory does not exist
  changedMessage: string;       // logged (debounced) when files change
  startedMessagePrefix: string; // logged on start, suffixed with the joined dir path
  onFire: () => void;
}

export class WorkspaceDirWatcher implements vscode.Disposable {
  private watcher?: vscode.FileSystemWatcher;
  private debounceTimer?: NodeJS.Timeout;

  constructor(private readonly config: DirWatcherConfig) {}

  start(): void {
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(this.config.workspaceRoot, ".code-intel", this.config.dirName);
    if (!fs.existsSync(dir)) {
      debugLog(this.config.missingMessage);
      return;
    }

    const pattern = new vscode.RelativePattern(this.config.workspaceRoot, this.config.glob);
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const onChanged = () => {
      if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
      this.debounceTimer = setTimeout(() => {
        debugLog(this.config.changedMessage);
        this.config.onFire();
      }, 300);
    };

    this.watcher.onDidCreate(onChanged);
    this.watcher.onDidChange(onChanged);
    this.watcher.onDidDelete(onChanged);

    debugLog(this.config.startedMessagePrefix + dir);
  }

  dispose(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
    if (this.watcher) { this.watcher.dispose(); this.watcher = undefined; }
  }
}

/** SA4E-189: watch .code-intel/agents/*.md and reload the agent list on change. */
export function createAgentWatcher(workspaceRoot: string, onFire: () => void): WorkspaceDirWatcher {
  return new WorkspaceDirWatcher({
    workspaceRoot,
    dirName: "agents",
    glob: ".code-intel/agents/*.md",
    missingMessage: "[ChatStateManager] agent hot-reload: .code-intel/agents not found, watcher skipped",
    changedMessage: "[ChatStateManager] agent files changed — reloading agent list",
    startedMessagePrefix: "[ChatStateManager] agent hot-reload watcher started: ",
    onFire,
  });
}

// SA4E-189: watch .code-intel/steering tree (*.md) and reload steering info on change.
// NOTE: line comment on purpose — a block comment here would close early on the `**/` glob.
export function createSteeringWatcher(workspaceRoot: string, onFire: () => void): WorkspaceDirWatcher {
  return new WorkspaceDirWatcher({
    workspaceRoot,
    dirName: "steering",
    glob: ".code-intel/steering/**/*.md",
    missingMessage: "[ChatStateManager] steering hot-reload: .code-intel/steering not found, watcher skipped",
    changedMessage: "[ChatStateManager] steering files changed — reloading steering info",
    startedMessagePrefix: "[ChatStateManager] steering hot-reload watcher started: ",
    onFire,
  });
}

// SA4E-189: watch .code-intel/hooks tree (no reload action yet).
// NOTE: line comment on purpose — a block comment here would close early on the `**/` glob.
export function createHooksWatcher(workspaceRoot: string, onFire: () => void): WorkspaceDirWatcher {
  return new WorkspaceDirWatcher({
    workspaceRoot,
    dirName: "hooks",
    glob: ".code-intel/hooks/**/*",
    missingMessage: "[ChatStateManager] hooks hot-reload: .code-intel/hooks not found, watcher skipped",
    changedMessage: "[ChatStateManager] hooks files changed — reloading hooks",
    startedMessagePrefix: "[ChatStateManager] hooks hot-reload watcher started: ",
    onFire,
  });
}

// SA4E-189: watch .code-intel/skills tree (SKILL.md) and reload skills on change.
// NOTE: line comment on purpose — a block comment here would close early on the `**/` glob.
export function createSkillsWatcher(workspaceRoot: string, onFire: () => void): WorkspaceDirWatcher {
  return new WorkspaceDirWatcher({
    workspaceRoot,
    dirName: "skills",
    glob: ".code-intel/skills/**/*.md",
    missingMessage: "[ChatStateManager] skills hot-reload: .code-intel/skills not found, watcher skipped",
    changedMessage: "[ChatStateManager] skills files changed — reloading skills",
    startedMessagePrefix: "[ChatStateManager] skills hot-reload watcher started: ",
    onFire,
  });
}
