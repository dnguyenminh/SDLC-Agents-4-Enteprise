/**
 * Chat Panel Message Protocol — KSA-210 + KSA-230
 * Type definitions for postMessage communication between
 * the Chat Panel webview and extension host.
 * Enhanced with Kiro-style UI features: context mentions, attachments,
 * model selector, autopilot toggle, tool calls, inline actions.
 */

import {
  SDLCPhase,
  PipelineStatus,
  ApprovalDecision,
  StreamEventType,
  PipelineGraphNode,
  QualityGateCheckpoint,
  ChatMessage,
  AgentOutput,
} from "../langgraph/state";
import { ContextUsagePayload } from "./context-usage-tracker";

// === Context & Attachment Types ===

export interface ContextItem {
  type: "file" | "folder" | "problems" | "gitDiff" | "terminal" | "spec" | "currentFile" | "steering" | "mcp";
  label: string;
  path?: string;
  content?: string;
}

export interface AttachmentItem {
  name: string;
  type: string; // MIME type
  size: number;
  uri: string; // webview-local URI or base64 data URI
}

export interface ToolCallDisplay {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: "running" | "completed" | "failed";
  result?: string;
  duration?: number;
}

export type AutopilotMode = "autopilot" | "supervised";
export type ModelOption = "auto" | "claude-sonnet" | "claude-haiku" | "gpt-4o" | "ollama" | "kiro";

/** A model entry presented in the Chat Panel model dropdown */
export interface ChatModelEntry {
  id: string;
  name: string;
  /** Short description of the model's capabilities (from Kiro API). KSA-237 */
  description?: string;
  /** Credit cost multiplier (1 = standard, 1.9 = premium, 0 = free). KSA-237 */
  rateMultiplier?: number;
}

// === Webview → Extension Messages ===

export type ChatWebviewToExtMessage =
  | { type: "chat:userMessage"; text: string; context?: ContextItem[]; attachments?: AttachmentItem[] }
  | { type: "chat:approvalAction"; decision: ApprovalDecision; feedback?: string }
  | { type: "chat:graphNodeClick"; nodeId: string }
  | { type: "chat:cancelStream"; streamId?: string }
  | { type: "chat:clearHistory" }
  | { type: "chat:resumePipeline"; threadId: string }
  | { type: "chat:startFresh" }
  | { type: "chat:pickContext"; contextType: "file" | "folder" | "problems" | "gitDiff" | "terminal" | "spec" | "currentFile" | "steering" | "mcp" }
  | { type: "chat:pickAttachment" }
  | { type: "chat:setModel"; model: string }
  | { type: "chat:setMode"; mode: AutopilotMode }
  | { type: "chat:applyCode"; code: string; filePath?: string }
  | { type: "chat:insertCode"; code: string }
  | { type: "tab:create" }
  | { type: "tab:switch"; payload: { tabId: string } }
  | { type: "tab:close"; payload: { tabId: string } }
  | { type: "tab:rename"; payload: { tabId: string; newName: string } }
  | { type: "chat:openWorkflowGraph" }
  | { type: "chat:saveState"; payload: { tabs: unknown[]; activeTabId: string } }
  | { type: "ready" }
  | { type: "refresh" };

// === Extension → Webview Messages ===

export type ChatExtToWebviewMessage =
  | { type: "chat:streamChunk"; streamId: string; nodeId: string; eventType: StreamEventType; content: string; timestamp: string; metadata?: Record<string, unknown> }
  | { type: "chat:streamComplete"; streamId: string; nodeId: string; finalContent: string; metadata?: Record<string, unknown> }
  | { type: "chat:graphUpdate"; nodes: PipelineGraphNode[] }
  | { type: "chat:approvalRequest"; checkpoint: QualityGateCheckpoint }
  | { type: "chat:chatHistory"; messages: ChatMessage[] }
  | { type: "chat:pipelineStatus"; status: PipelineStatus; phase: SDLCPhase; ticketKey: string }
  | { type: "chat:nodeDetails"; node: PipelineGraphNode; recentOutputs: AgentOutput[] }
  | { type: "chat:resumePrompt"; threadId: string; ticketKey: string; phase: SDLCPhase; pausedAt: string }
  | { type: "chat:error"; code: string; message: string; retryable: boolean }
  | { type: "chat:toolCall"; toolCall: ToolCallDisplay }
  | { type: "chat:toolCallUpdate"; id: string; status: ToolCallDisplay["status"]; result?: string; duration?: number }
  | { type: "chat:contextPicked"; item: ContextItem }
  | { type: "chat:configUpdate"; model: string; mode: AutopilotMode; availableModels: ModelOption[] }
  | { type: "chat:models"; provider: string; models: ChatModelEntry[]; selected: string; supportsAuto: boolean }
  | { type: "chat:workingStatus"; working: boolean; label?: string }
  | { type: "tab:updated"; payload: { tabs: Array<{ id: string; name: string; messages: unknown[]; tokenCount: number; maxTokens: number }>; activeTabId: string } }
  | { type: "tab:contextUpdate"; payload: { tabId: string; tokenCount: number; maxTokens: number; percentage: number; threshold: string } }
  | { type: "chat:steeringLoaded"; rules: Array<{ name: string; file: string }> }
  | { type: "chat:hookTriggered"; hook: { name: string; type: string; status: "running" | "completed" | "skipped" } }
  | { type: "chat:contextUsage"; payload: ContextUsagePayload }
  | { type: "serverStatus"; status: "connected" | "disconnected" | "failed" };
