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
} from "../mcp/state-types";
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
  /** Real context window (tokens) when the gateway's /v1/models reports it (context_length / meta.n_ctx). SA4E-369 */
  contextWindow?: number;
}

/** SA4E-389: Grouped model picker item (connected profiles only) */
export interface ModelPickerItem {
  profileId: string;
  modelId: string;
  modelName: string;
  isFree: boolean;
}

/** SA4E-389: Grouped model picker group (one per provider) */
export interface ModelPickerGroup {
  provider: string;
  items: ModelPickerItem[];
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
  | { type: "chat:setModelAndProfile"; profileId: string; model: string }
  | { type: "chat:getModelPickerGroups" }
  | { type: "chat:setMode"; mode: AutopilotMode }
  | { type: "chat:applyCode"; code: string; filePath?: string }
  | { type: "chat:insertCode"; code: string }
  | { type: "tab:create" }
  | { type: "tab:switch"; payload: { tabId: string } }
  | { type: "tab:close"; payload: { tabId: string } }
  | { type: "tab:rename"; payload: { tabId: string; newName: string } }
  | { type: "chat:saveState"; payload: { tabs: unknown[]; activeTabId: string } }
  | { type: "chat:selectAgent"; agentId: string | null }
  | { type: "chat:toolApproval"; toolId: string; decision: string; rememberPattern?: string }
  /** SA4E-369: export the ACTIVE conversation (tab model incl. tool calls/results) to a file. */
  | { type: "chat:exportConversation"; format: "markdown" | "json"; tab: { id?: string; name?: string; messages: unknown[] }; model?: string; mode?: string }
  /** SA4E-369: copy ONE message (or one tool call) as Markdown to the clipboard. */
  | { type: "chat:copyMessage"; entry: Record<string, unknown> }
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "chat:chatHistory" };

// === Extension → Webview Messages ===

export type ChatExtToWebviewMessage =
  | { type: "chat:streamChunk"; streamId: string; nodeId: string; eventType: StreamEventType; content: string; timestamp: string; metadata?: Record<string, unknown>; originTabId?: string }
  | { type: "chat:streamComplete"; streamId: string; nodeId: string; finalContent: string; metadata?: Record<string, unknown>; originTabId?: string }
  | { type: "chat:graphUpdate"; nodes: PipelineGraphNode[] }
  | { type: "chat:approvalRequest"; checkpoint: QualityGateCheckpoint }
  | { type: "chat:chatHistory"; messages: ChatMessage[] }
  | { type: "chat:pipelineStatus"; status: PipelineStatus; phase: SDLCPhase; ticketKey: string }
  | { type: "chat:nodeDetails"; node: PipelineGraphNode; recentOutputs: AgentOutput[] }
  | { type: "chat:resumePrompt"; threadId: string; ticketKey: string; phase: SDLCPhase; pausedAt: string }
  | { type: "chat:error"; code: string; message: string; retryable: boolean }
  | { type: "chat:toolCall"; toolCall: ToolCallDisplay; originTabId?: string }
  | { type: "chat:toolCallUpdate"; id: string; status: ToolCallDisplay["status"]; result?: string; duration?: number; originTabId?: string }
  /** SA4E-369 AC4: a peer task arrived in tab `tabId` — receiving-tab badge
   *  increment + `[Peer inbound] from <fromTabId>` transcript prefix row. */
  | { type: "chat:peerInbound"; tabId: string; fromTabId: string; fromAgentName: string; taskId: string; preview: string }
  /** SA4E-369 AC4: the receiving tab's auto-run peer turn settled — reply (or
   *  curated failure) appended to that tab's transcript below the prefix row. */
  | { type: "chat:peerTurnSettled"; tabId: string; taskId: string; ok: boolean; text?: string; error?: { code: string; message: string } }
  /** Fix J: a tool is waiting for user consent — the webview shows Approve/Reject on the working bar.
   *  SA4E-369 S-02: `peer` marks the same surface for a peer-turn tool call (D6 human approval). */
  | { type: "chat:toolApprovalPending"; toolId: string; toolName: string; peer?: boolean; originTabId?: string }
  | { type: "chat:contextPicked"; item: ContextItem }
  | { type: "chat:configUpdate"; model: string; mode: AutopilotMode; availableModels: ModelOption[] }
  | { type: "chat:models"; provider: string; models: ChatModelEntry[]; selected: string; supportsAuto: boolean }
  | { type: "chat:modelPickerGroups"; groups: ModelPickerGroup[] }
  | { type: "chat:modelAndProfileSet"; profileId: string; model: string }
  | { type: "chat:workingStatus"; working: boolean; label?: string }
  | { type: "tab:updated"; payload: { tabs: Array<{ id: string; name: string; messages: unknown[]; tokenCount: number; maxTokens: number }>; activeTabId: string } }
  | { type: "tab:contextUpdate"; payload: { tabId: string; tokenCount: number; maxTokens: number; percentage: number; threshold: string } }
  | { type: "chat:steeringLoaded"; rules: Array<{ name: string; file: string }> }
  | { type: "chat:agentsLoaded"; agents: Array<{ id: string; name: string; description: string; role?: string; phase?: string; model?: string; personaBody: string }> }
  | { type: "chat:hookTriggered"; hook: { name: string; type: string; status: "running" | "completed" | "skipped" } }
  | { type: "chat:contextUsage"; payload: ContextUsagePayload }
  | { type: "chat:agentSwitched"; agentId: string | null; agentName: string; success: boolean; tabId?: string; sessionRole?: string; sessionPhase?: string; error?: string }
  | { type: "serverStatus"; status: "connected" | "disconnected" | "failed" };
