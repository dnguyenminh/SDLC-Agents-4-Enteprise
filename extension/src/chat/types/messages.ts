/**
 * SA4E-85 — Message Protocol Types.
 * Discriminated unions for postMessage communication between
 * Extension Host and Svelte Webview. Type field serves as discriminant.
 */

import type { DiffSummaryPayload } from '../diff/IDiffTracker';

// --- Supporting Types ---

/** Stream error payload with structured error information */
export interface StreamError {
  code: string;
  message: string;
  retryable: boolean;
}

/** Tool execution category for UI display logic */
export type ToolType = 'shell' | 'file' | 'mcp' | 'browser' | 'search';

/** Result returned from a tool execution */
export interface ToolResult {
  content: string;
  isError: boolean;
  duration?: number;
}

/** Agent metadata discovered from configuration files */
export interface AgentMeta {
  id: string;
  name: string;
  description: string;
  /**
   * SA4E-186: Tool patterns for per-agent tool filtering.
   * - undefined = field omitted in frontmatter (unrestricted, all tools allowed)
   * - [] = explicit empty in frontmatter (text-only, no tools)
   * - string[] = specific tool patterns allowed
   */
  tools: string[] | undefined;
  /** SA4E-186: LLM model identifier for per-agent model routing */
  model?: string;
  mcpServers: string[];
  autoApprove: string[];
  filePath: string;
}

/** File included in the active context window */
export interface ContextFile {
  path: string;
  tokenCount: number;
  pinned: boolean;
}

/** Connection status for external services */
export type ServiceStatus = 'connected' | 'connecting' | 'disconnected' | 'offline';

// --- Extension Host → Webview Messages ---

export type ExtensionMessageType =
  | 'STREAM_START'
  | 'STREAM_TOKEN'
  | 'STREAM_END'
  | 'STREAM_ERROR'
  | 'THINKING_START'
  | 'THINKING_TOKEN'
  | 'THINKING_END'
  | 'TOOL_CALL_REQUEST'
  | 'TOOL_STREAM_OUTPUT'
  | 'MCP_TOOL_RESULT'
  | 'SYNC_AVAILABLE_AGENTS'
  | 'IPC_STATUS'
  | 'CONTEXT_UPDATE'
  | 'SYNC_CHAT_HISTORY'
  | 'COMPACT_START'
  | 'COMPACT_COMPLETE'
  | 'COMPACT_ERROR'
  | 'AGENT_SWITCHED'
  | 'tab:updated'
  | 'DIFF_COUNT_UPDATED'
  | 'DIFF_SUMMARY_RESPONSE';

/** A hydrated chat message from Backend KB history (SYNC_CHAT_HISTORY). */
export interface HydratedMessagePayload {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agentId?: string;
  timestamp: string;
}

/** Context snapshot carried with SYNC_CHAT_HISTORY (STC API-HYD-02, UT-HYD-01). */
export interface HydrationContext {
  tokenCount: number;
  maxTokens: number;
  files: ContextFile[];
}

export type ExtensionMessage =
  | { type: 'STREAM_START'; messageId: string; agentId: string }
  | { type: 'STREAM_TOKEN'; messageId: string; token: string }
  | { type: 'STREAM_END'; messageId: string }
  | { type: 'STREAM_ERROR'; messageId: string; error: StreamError }
  | { type: 'THINKING_START'; messageId: string }
  | { type: 'THINKING_TOKEN'; messageId: string; token: string }
  | { type: 'THINKING_END'; messageId: string }
  | { type: 'TOOL_CALL_REQUEST'; toolId: string; name: string; args: Record<string, unknown>; requiresApproval: boolean; toolType: ToolType }
  | { type: 'TOOL_STREAM_OUTPUT'; toolId: string; chunk: string; stream: 'stdout' | 'stderr' }
  | { type: 'MCP_TOOL_RESULT'; toolId: string; result: ToolResult; error?: string }
  | { type: 'SYNC_AVAILABLE_AGENTS'; agents: AgentMeta[] }
  | { type: 'IPC_STATUS'; service: string; status: ServiceStatus; endpoint?: string }
  | { type: 'CONTEXT_UPDATE'; tokenCount: number; maxTokens: number; files: ContextFile[] }
  | { type: 'SYNC_CHAT_HISTORY'; threadId: string; messages: HydratedMessagePayload[]; context: HydrationContext }
  | { type: 'COMPACT_START'; trigger: 'manual' | 'auto'; currentUsagePercent: number }
  | { type: 'COMPACT_COMPLETE'; method: 'summary' | 'truncation'; beforeUsagePercent: number; afterUsagePercent: number; summary: string }
  | { type: 'COMPACT_ERROR'; error: string; fallbackApplied: boolean }
  | { type: 'AGENT_SWITCHED'; agentId: string | null; agentName: string; tabId: string; success: boolean; sessionRole?: string; sessionPhase?: string; error?: string }
  | { type: 'tab:updated'; payload: { tabs: Array<{ id: string; name: string; messages: unknown[]; tokenCount: number; maxTokens: number }>; activeTabId: string } }
  | { type: 'DIFF_COUNT_UPDATED'; count: number }
  | { type: 'DIFF_SUMMARY_RESPONSE'; summary: DiffSummaryPayload };

// --- Webview → Extension Host Messages ---

export type WebviewMessageType =
  | 'SEND_PROMPT'
  | 'TOOL_CALL_RESPONSE'
  | 'COMMAND_DISPATCH'
  | 'RUN_TERMINAL_COMMAND'
  | 'ACTION_ACCEPT_DIFF'
  | 'ACTION_REJECT_DIFF'
  | 'REGENERATE_PATCH'
  | 'CONTEXT_UNPIN_FILE'
  | 'CONTEXT_CLEAR'
  | 'REQUEST_SYNC_STATE'
  | 'SELECT_AGENT'
  | 'DIFF_OPEN_FILE';

export type WebviewMessage =
  | { type: 'SEND_PROMPT'; text: string; agentId: string; contextFiles?: string[] }
  | { type: 'TOOL_CALL_RESPONSE'; toolId: string; decision: 'APPROVE' | 'REJECT'; rememberPattern?: string }
  | { type: 'COMMAND_DISPATCH'; command: string; args?: Record<string, unknown> }
  | { type: 'RUN_TERMINAL_COMMAND'; command: string; terminalName: string }
  | { type: 'ACTION_ACCEPT_DIFF'; diffId: string; filePath: string; patch: string }
  | { type: 'ACTION_REJECT_DIFF'; diffId: string }
  | { type: 'REGENERATE_PATCH'; diffId: string; filePath: string }
  | { type: 'CONTEXT_UNPIN_FILE'; filePath: string }
  | { type: 'CONTEXT_CLEAR' }
  | { type: 'REQUEST_SYNC_STATE' }
  | { type: 'SELECT_AGENT'; agentId: string | null }
  | { type: 'tab:switch'; payload: { tabId: string } }
  | { type: 'tab:create'; payload: { tab: { id: string; name: string; messages: unknown[]; tokenCount: number; maxTokens: number } } }
  | { type: 'tab:close'; payload: { tabId: string } }
  | { type: 'tab:rename'; payload: { tabId: string; newName: string } }
  | { type: 'DIFF_OPEN_FILE'; filePath: string; operation: 'added' | 'modified' | 'deleted' };

/** Union of all message type discriminants */
export type MessageType = ExtensionMessageType | WebviewMessageType;
