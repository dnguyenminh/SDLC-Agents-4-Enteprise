/**
 * ConversationManager — KSA-240
 * Manages multiple conversation tabs with independent contexts.
 * Each tab has its own message history, token count, and state.
 */

import { v4 as uuidv4 } from "uuid";
import { ConversationTab, TabMessage } from "./conversation-types";

/** SA4E-369: tab lifecycle listeners (registry wiring — TDD §6.1). */
export type TabCreatedListener = (tab: ConversationTab) => void;
export type TabClosedListener = (tabId: string) => void;

export class ConversationManager {
  private tabs: Map<string, ConversationTab> = new Map();
  private activeTabId: string = "";
  private readonly maxTabs: number;
  private tabCounter: number = 0;
  private readonly tabCreatedListeners: TabCreatedListener[] = [];
  private readonly tabClosedListeners: TabClosedListener[] = [];

  constructor(maxTabs: number = 10) {
    this.maxTabs = maxTabs;
    // Create initial tab
    this.createTab();
  }

  /** SA4E-369: subscribe to tab creation. Returns an unsubscribe function. */
  onTabCreated(listener: TabCreatedListener): () => void {
    this.tabCreatedListeners.push(listener);
    return () => {
      const idx = this.tabCreatedListeners.indexOf(listener);
      if (idx >= 0) this.tabCreatedListeners.splice(idx, 1);
    };
  }

  /** SA4E-369: subscribe to tab close. Returns an unsubscribe function. */
  onTabClosed(listener: TabClosedListener): () => void {
    this.tabClosedListeners.push(listener);
    return () => {
      const idx = this.tabClosedListeners.indexOf(listener);
      if (idx >= 0) this.tabClosedListeners.splice(idx, 1);
    };
  }

  /** Update-then-emit (I-3): listeners observe post-mutation state only. */
  private emitCreated(tab: ConversationTab): void {
    for (const listener of [...this.tabCreatedListeners]) {
      try { listener(tab); } catch { /* listener errors never break tab flows */ }
    }
  }

  private emitClosed(tabId: string): void {
    for (const listener of [...this.tabClosedListeners]) {
      try { listener(tabId); } catch { /* listener errors never break tab flows */ }
    }
  }

  createTab(): ConversationTab {
    if (this.tabs.size >= this.maxTabs) {
      throw new Error(`Maximum ${this.maxTabs} tabs reached`);
    }

    this.tabCounter++;
    const tab: ConversationTab = {
      id: uuidv4(),
      name: `Chat ${this.tabCounter}`,
      messages: [],
      tokenCount: 0,
      maxTokens: 128000, // Default, updated per provider/model
      isActive: true,
      createdAt: new Date().toISOString(),
      scrollPosition: 0,
      draftMessage: "",
    };

    // Deactivate current active tab
    if (this.activeTabId) {
      const current = this.tabs.get(this.activeTabId);
      if (current) {
        current.isActive = false;
      }
    }

    this.tabs.set(tab.id, tab);
    this.activeTabId = tab.id;
    this.emitCreated(tab);
    return tab;
  }

  switchTab(tabId: string): ConversationTab {
    const target = this.tabs.get(tabId);
    if (!target) {
      throw new Error(`Tab ${tabId} not found`);
    }

    // Save current tab state
    if (this.activeTabId && this.activeTabId !== tabId) {
      const current = this.tabs.get(this.activeTabId);
      if (current) {
        current.isActive = false;
      }
    }

    target.isActive = true;
    this.activeTabId = tabId;
    return target;
  }

  closeTab(tabId: string): { closedTab: ConversationTab; newActiveTab: ConversationTab | null } {
    if (this.tabs.size <= 1) {
      throw new Error("Cannot close the last tab");
    }

    const closedTab = this.tabs.get(tabId);
    if (!closedTab) {
      throw new Error(`Tab ${tabId} not found`);
    }

    // Determine new active tab (prefer left neighbor, fallback right)
    let newActiveTab: ConversationTab | null = null;
    if (closedTab.isActive) {
      const tabIds = Array.from(this.tabs.keys());
      const idx = tabIds.indexOf(tabId);
      const newIdx = idx > 0 ? idx - 1 : idx + 1;
      const newActiveId = tabIds[newIdx];
      newActiveTab = this.tabs.get(newActiveId) || null;
      if (newActiveTab) {
        newActiveTab.isActive = true;
        this.activeTabId = newActiveTab.id;
      }
    }

    this.tabs.delete(tabId);
    this.emitClosed(tabId);
    return { closedTab, newActiveTab };
  }

  renameTab(tabId: string, name: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }

    const trimmed = name.trim();
    if (!trimmed) {
      return; // Keep existing name if empty
    }

    tab.name = trimmed.substring(0, 30); // Max 30 chars
  }

  addMessage(tabId: string, message: TabMessage): void {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }

    tab.messages.push(message);
    tab.tokenCount += message.tokenCount;
  }

  updateTokenCount(tabId: string, tokenCount: number): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.tokenCount = tokenCount;
    }
  }

  setMaxTokens(tabId: string, maxTokens: number): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.maxTokens = maxTokens;
    }
  }

  saveDraft(tabId: string, draft: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.draftMessage = draft;
    }
  }

  saveScrollPosition(tabId: string, position: number): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.scrollPosition = position;
    }
  }

  getActiveTab(): ConversationTab | undefined {
    return this.tabs.get(this.activeTabId);
  }

  getTab(tabId: string): ConversationTab | undefined {
    return this.tabs.get(tabId);
  }

  getAllTabs(): ConversationTab[] {
    return Array.from(this.tabs.values());
  }

  getTabCount(): number {
    return this.tabs.size;
  }

  getActiveTabId(): string {
    return this.activeTabId;
  }

  canCreateTab(): boolean {
    return this.tabs.size < this.maxTabs;
  }

  hasMessages(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    return tab ? tab.messages.length > 0 : false;
  }
}
