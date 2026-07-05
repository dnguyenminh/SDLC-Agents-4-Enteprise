/**
 * ConfigWatcher — Monitors .kiro/settings/mcp.json for changes to code-intelligence server config.
 * Debounces rapid edits (500ms) and only triggers restart when config actually changes.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { McpServerManager } from "./mcp-server-manager";

export interface CodeIntelConfig {
  url?: string;
  port?: number;
  transportType?: string;
  command?: string;
  args?: string[];
  disabled?: boolean;
  [key: string]: unknown;
}

export class ConfigWatcher implements vscode.Disposable {
  private watcher: vscode.FileSystemWatcher | undefined;
  private debounceTimer: NodeJS.Timeout | undefined;
  private lastConfigHash: string = "";
  private suppressUntil: number = 0;
  private readonly outputChannel: vscode.OutputChannel;

  private static readonly DEBOUNCE_MS = 500;
  private static readonly SUPPRESS_MS = 2000;

  constructor(
    private readonly workspaceFolder: string,
    private readonly mcpManager: McpServerManager,
    outputChannel: vscode.OutputChannel
  ) {
    this.outputChannel = outputChannel;
    this.lastConfigHash = this.computeConfigHash();
    this.startWatching();
  }

  /**
   * Call this BEFORE writing to mcp.json to suppress self-triggered events.
   */
  suppressNextChange(): void {
    this.suppressUntil = Date.now() + ConfigWatcher.SUPPRESS_MS;
  }

  private get mcpConfigPath(): string {
    return path.join(this.workspaceFolder, ".kiro", "settings", "mcp.json");
  }

  private startWatching(): void {
    const pattern = new vscode.RelativePattern(
      this.workspaceFolder,
      ".kiro/settings/mcp.json"
    );

    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.watcher.onDidChange(() => this.onConfigFileChanged());
    this.watcher.onDidCreate(() => this.onConfigFileChanged());
    this.watcher.onDidDelete(() => this.onConfigFileDeleted());

    this.outputChannel.appendLine("[ConfigWatcher] Watching .kiro/settings/mcp.json");
  }

  private onConfigFileChanged(): void {
    if (Date.now() < this.suppressUntil) {
      return; // Ignore self-triggered change
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.handleConfigChange();
    }, ConfigWatcher.DEBOUNCE_MS);
  }

  private onConfigFileDeleted(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.handleConfigDeleted();
    }, ConfigWatcher.DEBOUNCE_MS);
  }

  private handleConfigChange(): void {
    const newHash = this.computeConfigHash();

    if (newHash === this.lastConfigHash) {
      this.outputChannel.appendLine("[ConfigWatcher] Config unchanged (hash match), skipping.");
      return;
    }

    this.lastConfigHash = newHash;
    const config = this.readCodeIntelConfig();

    if (!config) {
      // code-intelligence entry removed or invalid
      this.outputChannel.appendLine("[ConfigWatcher] code-intelligence config removed or invalid. Stopping server.");
      this.mcpManager.disconnect().catch((err) => {
        this.outputChannel.appendLine(`[ConfigWatcher] Disconnect failed: ${(err as Error).message}`);
      });
      return;
    }

    // If server is disabled, do NOT restart — just ensure it's stopped
    if (config.disabled === true) {
      this.outputChannel.appendLine("[ConfigWatcher] code-intelligence is disabled. Ensuring server is stopped.");
      this.mcpManager.disconnect().catch((err) => {
        this.outputChannel.appendLine(`[ConfigWatcher] Disconnect failed: ${(err as Error).message}`);
      });
      return;
    }

    // Config changed — restart server with new config
    this.outputChannel.appendLine("[ConfigWatcher] code-intelligence config changed. Restarting server...");
    this.mcpManager.reconnect().catch((err) => {
      this.outputChannel.appendLine(`[ConfigWatcher] Reconnect failed: ${(err as Error).message}`);
    });
  }

  private handleConfigDeleted(): void {
    this.outputChannel.appendLine("[ConfigWatcher] mcp.json deleted. Stopping server.");
    this.lastConfigHash = "";
    this.mcpManager.disconnect().catch((err) => {
      this.outputChannel.appendLine(`[ConfigWatcher] Disconnect failed: ${(err as Error).message}`);
    });
  }

  /**
   * Read the code-intelligence server config from mcp.json.
   * Returns null if file missing, invalid JSON, or code-intelligence entry absent.
   */
  readCodeIntelConfig(): CodeIntelConfig | null {
    try {
      if (!fs.existsSync(this.mcpConfigPath)) {
        return null;
      }
      const raw = fs.readFileSync(this.mcpConfigPath, "utf-8");
      const parsed = JSON.parse(raw);
      const serverConfig = parsed?.mcpServers?.["code-intelligence"];
      if (!serverConfig || typeof serverConfig !== "object") {
        return null;
      }
      return serverConfig as CodeIntelConfig;
    } catch {
      return null;
    }
  }

  /**
   * Compute a simple hash of the code-intelligence config section only.
   * Used to detect actual changes vs. unrelated edits to other servers.
   */
  private computeConfigHash(): string {
    const config = this.readCodeIntelConfig();
    if (!config) {
      return "";
    }
    return JSON.stringify(config);
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.watcher?.dispose();
  }
}
