/**
 * Conversation Tab Types — KSA-240
 * Type definitions for multi-tab conversation management
 * and context window usage tracking.
 */

export interface ConversationTab {
  id: string;
  name: string;
  messages: TabMessage[];
  tokenCount: number;
  maxTokens: number;
  isActive: boolean;
  createdAt: string;
  scrollPosition: number;
  draftMessage: string;
}

export interface TabMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  tokenCount: number;
}

export type ContextThreshold = "safe" | "warning" | "critical" | "full";

export interface ContextUsageState {
  tabId: string;
  tokenCount: number;
  maxTokens: number;
  percentage: number;
  threshold: ContextThreshold;
}

// Tab-related messages: Webview -> Extension Host
export type TabWebviewMessage =
  | { type: "tab:create" }
  | { type: "tab:switch"; payload: { tabId: string } }
  | { type: "tab:close"; payload: { tabId: string } }
  | { type: "tab:rename"; payload: { tabId: string; newName: string } };

// Tab-related messages: Extension Host -> Webview
export type TabExtMessage =
  | { type: "tab:updated"; payload: { tabs: ConversationTab[]; activeTabId: string } }
  | { type: "tab:contextUpdate"; payload: ContextUsageState };
