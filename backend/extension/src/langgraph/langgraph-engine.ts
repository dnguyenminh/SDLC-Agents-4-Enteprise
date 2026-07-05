// LangGraphEngine --- KSA-210 --- Singleton orchestration engine
import * as crypto from "crypto";
import { McpServerManager } from "../mcp-server-manager";
import { ChatExtToWebviewMessage } from "../chat-panel/message-protocol";
import { McpBridge } from "./mcp-bridge";
import { StreamHandler } from "./stream-handler";
import { WorkspaceCheckpointer } from "./checkpointer";
import { buildPipelineGraph } from "./graph-builder";
import { HookEngine } from "./hook-engine";
import type { LlmProvider } from "./llm-provider";
import { executeChat } from "./engine-chat-handler";
import {
  PipelineState,
  SDLCPhase,
  PipelineStatus,
  ApprovalDecision,
  PipelineIntent,
  PipelineGraphNode,
  PersistedPipelineInfo,
  ChatMessage,
} from "./state";

type CompiledGraph = Awaited<ReturnType<typeof buildPipelineGraph>>;

export class LangGraphEngine {
  private graph: CompiledGraph | null = null;
  private checkpointer: WorkspaceCheckpointer;
  private streamHandler: StreamHandler;
  private mcpBridge: McpBridge;
  private llmProvider: LlmProvider | undefined;
  private activeThread: string | null = null;
  private cancelled = false;
  private chatHistoryByTab: Map<string, ChatMessage[]> = new Map();
  private activeTabId: string = "";
  readonly hookEngine: HookEngine;

  constructor(
    private readonly mcpManager: McpServerManager,
    private readonly workspaceRoot: string,
    private readonly onEvent: (msg: ChatExtToWebviewMessage) => void,
    llmProvider?: LlmProvider
  ) {
    this.checkpointer = new WorkspaceCheckpointer(workspaceRoot);
    this.streamHandler = new StreamHandler(onEvent);
    this.mcpBridge = new McpBridge(mcpManager);
    this.llmProvider = llmProvider;
    this.hookEngine = new HookEngine(workspaceRoot);

    this.checkpointer.cleanup();
  }
  /** Set or replace the LLM provider at runtime (e.g., after settings change). */
  setLlmProvider(provider: LlmProvider | undefined): void {
    this.llmProvider = provider;
    this.graph = null;
  }
  /** KSA-280: Get the stream handler for external hook integration. */
  getStreamHandler(): StreamHandler {
    return this.streamHandler;
  }
  /** KSA-240: Set chat history from persisted state (e.g., after reload) */
  setChatHistory(history: ChatMessage[], tabId?: string): void {
    const id = tabId || this.activeTabId || "default";
    this.chatHistoryByTab.set(id, history);
    if (!this.activeTabId) this.activeTabId = id;
  }
  /** KSA-240: Get current chat history for persistence */
  getChatHistory(): ChatMessage[] {
    return this.chatHistoryByTab.get(this.activeTabId) || [];
  }
  /** KSA-240: Switch active tab — engine uses this tab's chatHistory */
  switchActiveTab(tabId: string): void {
    this.activeTabId = tabId;
    if (!this.chatHistoryByTab.has(tabId)) {
      this.chatHistoryByTab.set(tabId, []);
    }
  }
  /** Lazy-init: build graph on first invocation */
  private async ensureGraph(): Promise<CompiledGraph> {
    if (!this.graph) {
      this.graph = await buildPipelineGraph(this.mcpBridge, this.streamHandler, this.checkpointer, this.llmProvider, this.hookEngine);
    }
    return this.graph;
  }
  /** Start a new pipeline execution */
  async invoke(ticketKey: string, phase: SDLCPhase, chatInput: string, intent?: PipelineIntent): Promise<void> {
    const graph = await this.ensureGraph();
    const threadId = crypto.randomUUID();
    this.activeThread = threadId;
    this.cancelled = false;
    const streamId = `stream-${threadId}-${Date.now()}`;
    const resolvedIntent: PipelineIntent = intent || "sdlc";

    this.onEvent({ type: "chat:pipelineStatus", status: "running", phase, ticketKey });

    const initialState: Partial<PipelineState> = {
      ticketKey, threadId, currentPhase: phase, intent: resolvedIntent,
      pipelineStatus: "running", resumePoint: null, documents: {},
      agentOutputs: [], currentStreamId: streamId,
      approvalRequired: false, approvalDecision: null, userFeedback: null,
      pendingApprovals: [],
      chatHistory: [{ id: crypto.randomUUID(), role: "user", content: chatInput, timestamp: new Date().toISOString() }],
      errors: [], retryCount: {},
      createdAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString(), lastCheckpointAt: null,
    };

    try {
      await graph.invoke(initialState, { configurable: { thread_id: threadId } });
      if (!this.cancelled) {
        this.onEvent({ type: "chat:pipelineStatus", status: "paused", phase, ticketKey });
      }
    } catch (error) {
      this.onEvent({ type: "chat:error", code: "PIPELINE_ERROR", message: (error as Error).message, retryable: true });
    } finally {
      this.onEvent({ type: "chat:workingStatus", working: false });
    }
  }
  /** Resume from persisted checkpoint */
  async resume(threadId: string): Promise<void> {
    const graph = await this.ensureGraph();
    this.activeThread = threadId;
    this.cancelled = false;

    const tuple = await this.checkpointer.getTuple({ configurable: { thread_id: threadId } });
    if (!tuple) {
      this.onEvent({ type: "chat:error", code: "NO_CHECKPOINT", message: `No saved state for thread ${threadId}`, retryable: false });
      return;
    }
    try {
      await graph.invoke(null, { configurable: { thread_id: threadId } });
    } catch (error) {
      this.onEvent({ type: "chat:error", code: "RESUME_ERROR", message: (error as Error).message, retryable: true });
    }
  }
  /** Handle human approval decision — update state and resume */
  async handleApproval(decision: ApprovalDecision, feedback?: string): Promise<void> {
    if (!this.activeThread) return;
    const graph = await this.ensureGraph();
    await graph.invoke(
      { approvalDecision: decision, approvalRequired: false, userFeedback: feedback || null, pipelineStatus: decision === "reject" ? "cancelled" : "running" },
      { configurable: { thread_id: this.activeThread } }
    );
  }
  /** Cancel active execution */
  cancel(): void {
    this.cancelled = true;
    this.activeThread = null;
    this.onEvent({ type: "chat:pipelineStatus", status: "cancelled", phase: "requirements", ticketKey: "" });
  }
  async invokeChat(chatInput: string): Promise<void> {
    const graph = await this.ensureGraph();
    this.cancelled = false;

    if (!this.activeTabId) this.activeTabId = "default";

    const { activeThread } = await executeChat(
      chatInput,
      this.activeTabId,
      this.chatHistoryByTab,
      graph,
      this.streamHandler,
      this.onEvent
    );
    this.activeThread = activeThread;
  }
  /** List persisted pipelines for resume prompt */
  listPersistedPipelines(): PersistedPipelineInfo[] {
    return this.checkpointer.listPersistedPipelines();
  }
  /** Get current graph node states for visualization */
  getCurrentNodeStates(): PipelineGraphNode[] {
    // Static node definitions — status updated from last known state
    const nodeIds: Array<{ id: string; label: string; phase: SDLCPhase }> = [
      { id: "sm", label: "Scrum Master", phase: "requirements" },
      { id: "ba", label: "Business Analyst", phase: "requirements" },
      { id: "sa", label: "Solution Architect", phase: "design" },
      { id: "approval", label: "Quality Gate", phase: "requirements" },
    ];

    return nodeIds.map(n => ({
      ...n,
      status: "idle" as const,
    }));
  }
  /** Dispose resources */
  dispose(): void {
    this.streamHandler.dispose();
    this.hookEngine.dispose();
    this.activeThread = null;
  }
}
