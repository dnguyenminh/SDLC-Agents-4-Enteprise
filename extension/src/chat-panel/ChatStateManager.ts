/**
 * ChatStateManager — handles chat state persistence, restoration,
 * and steering info loading.
 *
 * Hot-reload watchers live in ./ChatStateManager/dir-watchers.ts and the
 * filesystem helpers in ./ChatStateManager/fs-helpers.ts; this facade keeps
 * the exact public API and constructor signature.
 */

import * as vscode from "vscode";
import { debugLog, debugError } from "../debug-logger";
import { PiWorkflowAdapter } from "../pi-workflow";
import { ChatExtToWebviewMessage } from "./message-protocol";
import {
  WorkspaceDirWatcher,
  createAgentWatcher,
  createHooksWatcher,
  createSkillsWatcher,
  createSteeringWatcher,
} from "./ChatStateManager/dir-watchers";
import { collectSteeringRules, readAgentInfos, readSkillInfos } from "./ChatStateManager/fs-helpers";

const STATE_KEY = "chatPanel.state";

export class ChatStateManager implements vscode.Disposable {
  private agentWatcher: WorkspaceDirWatcher;
  private steeringWatcher: WorkspaceDirWatcher;
  private hooksWatcher: WorkspaceDirWatcher;
  private skillsWatcher: WorkspaceDirWatcher;
  /** SA4E-370 S4: per-tab active agent for badge display (tabId -> agentId). */
  private readonly activeAgentByTab = new Map<string, string>();

  constructor(
    private readonly workspaceRoot: string,
    private readonly workspaceState: vscode.Memento | undefined,
    private readonly sendToWebview: (msg: ChatExtToWebviewMessage) => void,
    private readonly getEngine: () => PiWorkflowAdapter
  ) {
    this.agentWatcher = createAgentWatcher(workspaceRoot, () => this.sendAgentsInfo());
    this.agentWatcher.start();
    this.steeringWatcher = createSteeringWatcher(workspaceRoot, () => this.sendSteeringInfo());
    this.steeringWatcher.start();
    this.hooksWatcher = createHooksWatcher(workspaceRoot, () => {
      // Future: sendHooksInfo() if needed
    });
    this.hooksWatcher.start();
    this.skillsWatcher = createSkillsWatcher(workspaceRoot, () => this.sendSkillsInfo());
    this.skillsWatcher.start();
    this.broadcastInitialState();
  }

  /** SA4E-370 S4: set the active agent for a tab (badge + switch indicator). */
  setActiveAgentForTab(tabId: string, agentId: string | null): void {
    if (agentId) {
      this.activeAgentByTab.set(tabId, agentId);
    } else {
      this.activeAgentByTab.delete(tabId);
    }
  }

  /** SA4E-370 S4: get the active agent id for a tab (badge lookup). */
  getActiveAgentForTab(tabId: string): string | null {
    return this.activeAgentByTab.get(tabId) ?? null;
  }

  public broadcastInitialState(): void {
    try { this.sendAgentsInfo(); } catch (e) { debugError("[ChatPanel] initial sendAgentsInfo failed", e as Error); }
    try { this.sendSteeringInfo(); } catch (e) { debugError("[ChatPanel] initial sendSteeringInfo failed", e as Error); }
    try { this.sendSkillsInfo(); } catch (e) { debugError("[ChatPanel] initial sendSkillsInfo failed", e as Error); }
  }

  dispose(): void {
    this.agentWatcher.dispose();
    this.steeringWatcher.dispose();
    this.hooksWatcher.dispose();
    this.skillsWatcher.dispose();
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
      const rules = collectSteeringRules(this.workspaceRoot);
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
      const agents = readAgentInfos(this.workspaceRoot);
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
      const skills = readSkillInfos(this.workspaceRoot);
      debugLog(`[ChatStateManager] sendSkillsInfo: ${skills.length} skills`);
      if (skills.length > 0) {
        this.sendToWebview({ type: "chat:skillsLoaded", skills } as any);
      }
    } catch (err) {
      debugError("[ChatPanel] sendSkillsInfo failed", err as Error);
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
}
