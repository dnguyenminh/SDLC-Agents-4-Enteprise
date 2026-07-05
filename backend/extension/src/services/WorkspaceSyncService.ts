/**
 * WorkspaceSyncService — Syncs file tree metadata to remote backend.
 * Sends relative paths only (no file content, no absolute paths).
 */

import * as vscode from "vscode";
import { HttpClient } from "../proxy/HttpClient";

export class WorkspaceSyncService implements vscode.Disposable {
  private watcher: vscode.Disposable | undefined;

  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Start watching for workspace folder changes.
   */
  startWatching(): void {
    this.watcher = vscode.workspace.onDidChangeWorkspaceFolders(() => this.sync());
  }

  /**
   * Sync the file tree to the backend.
   */
  async sync(): Promise<void> {
    const files = await vscode.workspace.findFiles(
      "**/*",
      "{node_modules,dist,.git,build,out,.code-intel}/**"
    );
    const tree = {
      workspace_name: vscode.workspace.name || "unknown",
      files: await Promise.all(
        files.slice(0, 10000).map(async (f) => {
          const stat = await vscode.workspace.fs.stat(f);
          return {
            path: vscode.workspace.asRelativePath(f),
            type: "file" as const,
            size: stat.size,
          };
        })
      ),
    };
    await this.httpClient.post("/api/workspace/sync", tree, 30000);
  }

  dispose(): void {
    this.watcher?.dispose();
  }
}
