/**
 * ChatStateManager — handles chat state persistence, restoration,
 * and steering info loading.
 */

import * as vscode from "vscode";
import { debugLog, debugError } from "../debug-logger";
import { PiWorkflowAdapter } from "../pi-workflow";
import { ChatExtToWebviewMessage } from "./message-protocol";

const STATE_KEY = "chatPanel.state";

export class ChatStateManager implements vscode.Disposable {
  private agentWatcher?: vscode.FileSystemWatcher;
  private agentDebounceTimer?: NodeJS.Timeout;
  private steeringWatcher?: vscode.FileSystemWatcher;
  private steeringDebounceTimer?: NodeJS.Timeout;
  private hooksWatcher?: vscode.FileSystemWatcher;
  private hooksDebounceTimer?: NodeJS.Timeout;
  private skillsWatcher?: vscode.FileSystemWatcher;
  private skillsDebounceTimer?: NodeJS.Timeout;

  constructor(
    private readonly workspaceRoot: string,
    private readonly workspaceState: vscode.Memento | undefined,
    private readonly sendToWebview: (msg: ChatExtToWebviewMessage) => void,
    private readonly getEngine: () => PiWorkflowAdapter
  ) {
    this.startAgentWatcher();
    this.startSteeringWatcher();
    this.startHooksWatcher();
    this.startSkillsWatcher();
    this.broadcastInitialState();
  }

  public broadcastInitialState(): void {
    try { this.sendAgentsInfo(); } catch (e) { debugError("[ChatPanel] initial sendAgentsInfo failed", e as Error); }
    try { this.sendSteeringInfo(); } catch (e) { debugError("[ChatPanel] initial sendSteeringInfo failed", e as Error); }
    try { this.sendSkillsInfo(); } catch (e) { debugError("[ChatPanel] initial sendSkillsInfo failed", e as Error); }
  }

  /**
   * SA4E-189: Hot-reload agent list when .kiro/agents/*.md files change.
   * Watches for create/change/delete, debounces 300ms, re-sends agent list to webview.
   */
  private startAgentWatcher(): void {
    const fs = require("fs");
    const path = require("path");
    const agentsDir = path.join(this.workspaceRoot, ".code-intel", "agents");
    if (!fs.existsSync(agentsDir)) {
      debugLog("[ChatStateManager] agent hot-reload: .code-intel/agents not found, watcher skipped");
      return;
    }

    const pattern = new vscode.RelativePattern(this.workspaceRoot, ".code-intel/agents/*.md");
    this.agentWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    const onAgentsChanged = () => {
      if (this.agentDebounceTimer) { clearTimeout(this.agentDebounceTimer); }
      this.agentDebounceTimer = setTimeout(() => {
        debugLog("[ChatStateManager] agent files changed — reloading agent list");
        this.sendAgentsInfo();
      }, 300);
    };

    this.agentWatcher.onDidCreate(onAgentsChanged);
    this.agentWatcher.onDidChange(onAgentsChanged);
    this.agentWatcher.onDidDelete(onAgentsChanged);

    debugLog("[ChatStateManager] agent hot-reload watcher started: " + agentsDir);
  }

  private startSteeringWatcher(): void {
    const fs = require("fs");
    const path = require("path");
    const steeringDir = path.join(this.workspaceRoot, ".code-intel", "steering");
    if (!fs.existsSync(steeringDir)) {
      debugLog("[ChatStateManager] steering hot-reload: .code-intel/steering not found, watcher skipped");
      return;
    }
    const pattern = new vscode.RelativePattern(this.workspaceRoot, ".code-intel/steering/**/*.md");
    this.steeringWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    const onSteeringChanged = () => {
      if (this.steeringDebounceTimer) { clearTimeout(this.steeringDebounceTimer); }
      this.steeringDebounceTimer = setTimeout(() => {
        debugLog("[ChatStateManager] steering files changed — reloading steering info");
        this.sendSteeringInfo();
      }, 300);
    };
    this.steeringWatcher.onDidCreate(onSteeringChanged);
    this.steeringWatcher.onDidChange(onSteeringChanged);
    this.steeringWatcher.onDidDelete(onSteeringChanged);
    debugLog("[ChatStateManager] steering hot-reload watcher started: " + steeringDir);
  }

  private startHooksWatcher(): void {
    const fs = require("fs");
    const path = require("path");
    const hooksDir = path.join(this.workspaceRoot, ".code-intel", "hooks");
    if (!fs.existsSync(hooksDir)) {
      debugLog("[ChatStateManager] hooks hot-reload: .code-intel/hooks not found, watcher skipped");
      return;
    }
    const pattern = new vscode.RelativePattern(this.workspaceRoot, ".code-intel/hooks/**/*");
    this.hooksWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    const onHooksChanged = () => {
      if (this.hooksDebounceTimer) { clearTimeout(this.hooksDebounceTimer); }
      this.hooksDebounceTimer = setTimeout(() => {
        debugLog("[ChatStateManager] hooks files changed — reloading hooks");
        // Future: sendHooksInfo() if needed
      }, 300);
    };
    this.hooksWatcher.onDidCreate(onHooksChanged);
    this.hooksWatcher.onDidChange(onHooksChanged);
    this.hooksWatcher.onDidDelete(onHooksChanged);
    debugLog("[ChatStateManager] hooks hot-reload watcher started: " + hooksDir);
  }

  private startSkillsWatcher(): void {
    const fs = require("fs");
    const path = require("path");
    const skillsDir = path.join(this.workspaceRoot, ".code-intel", "skills");
    if (!fs.existsSync(skillsDir)) {
      debugLog("[ChatStateManager] skills hot-reload: .code-intel/skills not found, watcher skipped");
      return;
    }
    const pattern = new vscode.RelativePattern(this.workspaceRoot, ".code-intel/skills/**/*.md");
    this.skillsWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    const onSkillsChanged = () => {
      if (this.skillsDebounceTimer) { clearTimeout(this.skillsDebounceTimer); }
      this.skillsDebounceTimer = setTimeout(() => {
        debugLog("[ChatStateManager] skills files changed — reloading skills");
        this.sendSkillsInfo();
      }, 300);
    };
    this.skillsWatcher.onDidCreate(onSkillsChanged);
    this.skillsWatcher.onDidChange(onSkillsChanged);
    this.skillsWatcher.onDidDelete(onSkillsChanged);
    debugLog("[ChatStateManager] skills hot-reload watcher started: " + skillsDir);
  }

  dispose(): void {
    if (this.agentDebounceTimer) { clearTimeout(this.agentDebounceTimer); }
    if (this.agentWatcher) { this.agentWatcher.dispose(); this.agentWatcher = undefined; }
    if (this.steeringDebounceTimer) { clearTimeout(this.steeringDebounceTimer); }
    if (this.steeringWatcher) { this.steeringWatcher.dispose(); this.steeringWatcher = undefined; }
    if (this.hooksDebounceTimer) { clearTimeout(this.hooksDebounceTimer); }
    if (this.hooksWatcher) { this.hooksWatcher.dispose(); this.hooksWatcher = undefined; }
    if (this.skillsDebounceTimer) { clearTimeout(this.skillsDebounceTimer); }
    if (this.skillsWatcher) { this.skillsWatcher.dispose(); this.skillsWatcher = undefined; }
  }

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
      const steeringDir = path.join(this.workspaceRoot, ".code-intel", "steering");
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

  /**
   * SA4E-186: Send available agents to webview (dynamic, from .kiro/agents/*.md).
   * Reads frontmatter to extract name + description for slash menu display.
   */
  sendAgentsInfo(): void {
    try {
      const fs = require("fs");
      const path = require("path");
      const agentsDir = path.join(this.workspaceRoot, ".code-intel", "agents");
      if (!fs.existsSync(agentsDir)) { return; }

      const agents: Array<{ id: string; name: string; description: string }> = [];
      const files = fs.readdirSync(agentsDir).filter((f: string) => f.endsWith(".md"));

      for (const file of files) {
        const id = path.basename(file, ".md");
        const filePath = path.join(agentsDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const meta = this.parseAgentFrontmatter(content, id);
        agents.push({ ...meta, id });
      }

      if (agents.length > 0) {
        this.sendToWebview({ type: "chat:agentsLoaded", agents } as any);
      }
    } catch (err) {
      debugError("[ChatPanel] sendAgentsInfo failed", err as Error);
    }
  }

  /**
   * SA4E-188: Send available skills to webview (dynamic, from .code-intel/skills/<id>/SKILL.md).
   * Mirrors sendAgentsInfo — reads the live workspace folder, not bundled resources.
   */
  sendSkillsInfo(): void {
    try {
      const fs = require("fs");
      const path = require("path");
      const skillsDir = path.join(this.workspaceRoot, ".code-intel", "skills");
      if (!fs.existsSync(skillsDir)) {
        debugLog("[ChatStateManager] skills dir not found: " + skillsDir);
        return;
      }
      const skills: Array<{ id: string; label: string; description: string }> = [];
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillId = entry.name;
        const skillFile = path.join(skillsDir, skillId, "SKILL.md");
        let description = "";
        if (fs.existsSync(skillFile)) {
          const content = fs.readFileSync(skillFile, "utf-8");
          const m = content.match(/description:\s*["']([^"']+)["']/);
          if (m) description = m[1];
        }
        skills.push({ id: skillId, label: skillId, description });
      }
      debugLog(`[ChatStateManager] sendSkillsInfo: ${skills.length} skills`);
      if (skills.length > 0) {
        this.sendToWebview({ type: "chat:skillsLoaded", skills } as any);
      }
    } catch (err) {
      debugError("[ChatPanel] sendSkillsInfo failed", err as Error);
    }
  }

  /** Extract name + description from agent frontmatter. */
  private parseAgentFrontmatter(content: string, fallbackId: string): { id: string; name: string; description: string } {    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) { return { id: fallbackId, name: fallbackId, description: "" }; }
    const yaml = match[1];
    const nameMatch = yaml.match(/^(?:label|name):\s*(.+)$/m);
    const descMatch = yaml.match(/^description:\s*(.+)$/m);
    return {
      id: fallbackId,
      name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, "") : fallbackId,
      description: descMatch ? descMatch[1].trim().replace(/^["'>]|["']$/g, "").slice(0, 80) : "",
    };
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
    } catch (err) {
      console.debug("[ChatStateManager] shouldIncludeSteeringFile failed: " + (err as Error).message);
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
    } catch (err) {
      console.debug(`[ChatStateManager] getSteeringFilesRecursive failed (non-fatal): ${(err as Error).message}`);
    }
    return results;
  }

  private getAgentFilesRecursive(dir: string): string[] {
    const fs = require("fs");
    const path = require("path");
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.getAgentFilesRecursive(fullPath));
        } else if (entry.name.endsWith(".md")) {
          results.push(fullPath);
        }
      }
    } catch (err) {
      console.debug(`[ChatStateManager] getAgentFilesRecursive failed (non-fatal): ${(err as Error).message}`);
    }
    return results;
  }
}


