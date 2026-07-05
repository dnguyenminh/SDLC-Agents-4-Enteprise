/**
 * ChatStateManager — handles chat state persistence, restoration,
 * and steering info loading.
 */

import * as vscode from "vscode";
import { debugLog, debugError } from "../debug-logger";
import { LangGraphEngine } from "../langgraph/langgraph-engine";
import { ChatExtToWebviewMessage } from "./message-protocol";

const STATE_KEY = "chatPanel.state";

export class ChatStateManager {
  constructor(
    private readonly workspaceRoot: string,
    private readonly workspaceState: vscode.Memento | undefined,
    private readonly sendToWebview: (msg: ChatExtToWebviewMessage) => void,
    private readonly getEngine: () => LangGraphEngine
  ) {}

  /** Save current chat state (called from webview via message) */
  saveChatState(state: { tabs: unknown[]; activeTabId: string; messageHistory?: string[] }): void {
    if (!this.workspaceState) { return; }
    debugLog(` saveChatState: ${(state.tabs as any[])?.length || 0} tabs, activeTab=${state.activeTabId}`);
    void this.workspaceState.update(STATE_KEY, state);
  }

  /** Restore chat state on webview ready */
  restoreChatState(): void {
    if (!this.workspaceState) { return; }
    const state = this.workspaceState.get<{
      tabs: unknown[]; activeTabId: string; messageHistory?: string[];
    }>(STATE_KEY);
    debugLog(` restoreChatState: state=${state ? "found" : "null"}`);

    if (!state || !state.tabs || state.tabs.length === 0) { return; }

    this.sendToWebview({
      type: "tab:updated",
      payload: {
        tabs: state.tabs as any,
        activeTabId: state.activeTabId,
        messageHistory: state.messageHistory,
      } as any,
    });

    this.restoreEngineHistory(state);
  }

  /** Send steering files and hooks info to webview. */
  sendSteeringInfo(): void {
    try {
      const fs = require("fs");
      const path = require("path");
      const steeringDir = path.join(this.workspaceRoot, ".kiro", "steering");
      const rules: Array<{ name: string; file: string }> = [];
      const autoInjectInclusions = new Set(["always", "auto"]);

      if (!fs.existsSync(steeringDir)) { return; }

      const files = this.getSteeringFilesRecursive(steeringDir, steeringDir);
      for (const file of files) {
        if (this.shouldIncludeSteeringFile(path.join(steeringDir, file), autoInjectInclusions)) {
          const name = path.basename(file, ".md").replace(/-/g, " ");
          rules.push({ name, file });
        }
      }

      if (rules.length > 0) {
        this.sendToWebview({ type: "chat:steeringLoaded", rules });
      }
    } catch (err) {
      debugError("[ChatPanel] sendSteeringInfo failed", err as Error);
    }
  }

  private shouldIncludeSteeringFile(fullPath: string, validInclusions: Set<string>): boolean {
    try {
      const fs = require("fs");
      const content: string = fs.readFileSync(fullPath, "utf-8");
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fmMatch) { return false; }
      const inclusionMatch = fmMatch[1].match(/^inclusion\s*:\s*["']?(\w+)["']?\s*$/m);
      if (!inclusionMatch) { return false; }
      return validInclusions.has(inclusionMatch[1].toLowerCase());
    } catch {
      return false;
    }
  }

  private restoreEngineHistory(state: { tabs: unknown[]; activeTabId: string }): void {
    const activeTab = (state.tabs as any[]).find((t: any) => t.id === state.activeTabId);
    if (!activeTab?.messages?.length) { return; }
    try {
      const engine = this.getEngine();
      const chatMsgs = (activeTab.messages as any[])
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .slice(-20)
        .map((m: any) => ({
          id: m.id || require("crypto").randomUUID(),
          role: m.role,
          content: m.content,
          timestamp: m.timestamp || new Date().toISOString(),
        }));
      debugLog(` restoreChatState: restoring ${chatMsgs.length} messages to engine`);
      engine.setChatHistory(chatMsgs, state.activeTabId);
    } catch (e) {
      debugError(` restoreChatState: engine restore failed:`, (e as Error));
    }
  }

  private getSteeringFilesRecursive(dir: string, baseDir: string): string[] {
    const fs = require("fs");
    const path = require("path");
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.getSteeringFilesRecursive(fullPath, baseDir));
        } else if (entry.name.endsWith(".md")) {
          results.push(path.relative(baseDir, fullPath).replace(/\\/g, "/"));
        }
      }
    } catch { /* ignore */ }
    return results;
  }
}
