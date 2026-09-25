// LangGraphEngine --- KSA-210 --- Singleton orchestration engine
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { McpServerManager } from "../../mcp-server-manager";
import { IServerManager } from "../../types/server-types";
import { ChatExtToWebviewMessage } from "../../chat-panel/message-protocol";
import { McpBridge } from "../core/mcp-bridge";
import { StreamHandler } from "../core/stream-handler";
import { RemoteCheckpointer } from "../core/remote-checkpointer";
import { buildPipelineGraph } from "../subgraphs/graph-builder";
import { HookEngine } from "../hooks/hook-engine";
import type { LlmProvider } from "../core/llm-provider";
import { executeChat } from "./engine-chat-handler";
import { agentRegistry } from "../agents/registry";
import { PipelineExtractor } from "../agents/pipeline-extractor";
import { AgentConfigResolver } from "../agents/agent-config-resolver";
import type { FindAgentMetaFn } from "../agents/agent-config-resolver";
import { DiagnosticsFeedService } from "../diagnostics/diagnostics-feed-service";
import { ToolApprovalGate } from "../../chat/engine/ToolApprovalGate";
import { CommandPatternMatcher } from "../../chat/engine/CommandPatternMatcher";
import { getActiveManualRules, toActiveSteeringRules } from "../steering/session-store";
import {
  PipelineState,
  SDLCPhase,
  PipelineStatus,
  ApprovalDecision,
  AutonomyLevel,
  PipelineIntent,
  PipelineGraphNode,
  PersistedPipelineInfo,
  ChatMessage,
  PipelineDefState,
} from "../core/state";

type CompiledGraph = Awaited<ReturnType<typeof buildPipelineGraph>>;

/**
 * @deprecated Deprecated as part of SA4E-289 / SA4E-297 (Option C Pi SDK Migration).
 * Replaced by PiWorkflowAdapter and PiWorkflowEngine in `src/pi-workflow/`.
 * Disconnected from active runtime (ChatPanelProvider and ChatEngineAdapter now use PiWorkflowAdapter).
 */
export class LangGraphEngine {
  private graph: CompiledGraph | null = null;
  private checkpointer: RemoteCheckpointer;
  private streamHandler: StreamHandler;
  private mcpBridge: McpBridge;
  private llmProvider: LlmProvider | undefined;
  private activeThread: string | null = null;
  private cancelled = false;
  private chatHistoryByTab: Map<string, ChatMessage[]> = new Map();
  private activeTabId: string = "";
  readonly hookEngine: HookEngine;
  readonly agentConfigResolver: AgentConfigResolver;
  readonly diagnosticsFeed: DiagnosticsFeedService;
  readonly approvalGate: ToolApprovalGate;
  readonly commandPatternMatcher: CommandPatternMatcher;

  constructor(
    private readonly mcpManager: IServerManager,
    private readonly workspaceRoot: string,
    private readonly onEvent: (msg: ChatExtToWebviewMessage) => void,
    llmProvider?: LlmProvider,
    findAgentMeta?: FindAgentMetaFn,
    diagnosticsFeed?: DiagnosticsFeedService
  ) {
    // [v3.1] Persistence is backend-driven: RemoteCheckpointer talks to the
    // Backend Knowledge Service over HTTP (no local state files).
    this.checkpointer = new RemoteCheckpointer();
    this.streamHandler = new StreamHandler(onEvent);
    this.mcpBridge = new McpBridge(mcpManager);
    this.llmProvider = llmProvider;
    this.hookEngine = new HookEngine(workspaceRoot);
    this.diagnosticsFeed = diagnosticsFeed ?? new DiagnosticsFeedService(workspaceRoot);
    // SA4E-185 C-2 (B1): single approval gate shared by the LangGraph chat path
    // and the ChatEngineAdapter webview TOOL_CALL_RESPONSE resolver (extension.ts).
    this.approvalGate = new ToolApprovalGate();
    this.commandPatternMatcher = new CommandPatternMatcher();

    // SA4E-186: Agent config resolver for per-agent runtime routing
    this.agentConfigResolver = new AgentConfigResolver(
      workspaceRoot,
      findAgentMeta || (() => undefined)
    );

    agentRegistry.load(workspaceRoot);
  }
  /** Set or replace the LLM provider at runtime (e.g., after settings change). */
  setLlmProvider(provider: LlmProvider | undefined): void {
    this.llmProvider = provider;
    this.graph = null;
  }

  /**
   * SA4E-186: Select an agent for per-agent runtime routing.
   * Delegates to AgentConfigResolver. Returns confirmation payload.
   */
  selectAgent(agentId: string | null): { agentId: string | null; agentName: string } {
    return this.agentConfigResolver.selectAgent(agentId);
  }

  /**
   * SA4E-182: Get detected context window from the LLM provider.
   * Returns 0 if provider not set or context window unknown.
   * Call after ensureGraph() has run (which triggers detectContextWindow).
   */
  getDetectedContextWindow(): number {
    return this.llmProvider?.getContextWindow?.() || 0;
  }

  /**
   * SA4E-182: Trigger early context window detection without building the full graph.
   * Called at panel ready time to get accurate maxTokens before first invoke.
   * Fast: single HTTP call to /v1/models (local) or no-op (cloud).
   */
  async detectContextWindowEarly(): Promise<void> {
    if (this.llmProvider && (this.llmProvider as any).detectContextWindow) {
      try { await (this.llmProvider as any).detectContextWindow(); }
      catch { /* non-fatal — will retry in ensureGraph */ }
    }
  }

  /**
   * SA4E-182: List available MCP + VS Code tools for token counting.
   * Returns tool definitions array (cached by ToolRegistry after first fetch).
   * Non-blocking: returns empty array if MCP unavailable.
   */
  async listAvailableTools(): Promise<Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>> {
    try {
      const tools = await this.mcpBridge.listTools();
      const { VSCODE_TOOL_DEFINITIONS } = await import("../vscode/vscode-tool-definitions");
      return [...VSCODE_TOOL_DEFINITIONS, ...tools];
    } catch {
      return [];
    }
  }
  /**
   * Sandboxed Hot-Swap: validate and apply a live pipeline spec mutation.
   * Re-runs PipelineExtractor on current agent .md files with LLM,
   * validates the result, then invalidates graph cache on success.
   * Returns true if mutation was applied, false if validation failed.
   */
  async handleLiveSpecMutation(): Promise<boolean> {
    const agentsDir = path.join(this.workspaceRoot, ".kiro", "agents");
    if (!fs.existsSync(agentsDir) || !this.llmProvider) {
      return false;
    }

    const mdFiles = fs.readdirSync(agentsDir)
      .filter(f => f.endsWith(".md") && !f.startsWith("prompts"))
      .map(f => path.join(agentsDir, f));

    const agentContents = mdFiles.map(file => {
      const id = path.basename(file, ".md");
      const content = fs.readFileSync(file, "utf-8");
      return { id, content };
    });

    if (agentContents.length === 0) return false;

    const extractor = new PipelineExtractor();
    try {
      const candidate = await extractor.extract(agentContents, this.llmProvider);

      if (!candidate || !candidate.phases || candidate.phases.length === 0) {
        this.onEvent({ type: "chat:error", code: "INVALID_PIPELINE_SPEC", message: "Pipeline extractor returned empty phases", retryable: true });
        return false;
      }

      for (const phase of candidate.phases) {
        if (!phase.id || !phase.agentIds || phase.agentIds.length === 0) {
          this.onEvent({ type: "chat:error", code: "INVALID_PIPELINE_SPEC", message: `Phase "${phase.id || "unnamed"}" has no agents`, retryable: true });
          return false;
        }
      }

      await agentRegistry.loadPipeline(this.workspaceRoot, this.llmProvider);
      this.graph = null;

      this.onEvent({ type: "chat:pipelineStatus", status: "idle", phase: "requirements", ticketKey: "" });
      this.streamHandler.emitDirect({
        type: "chat:streamChunk",
        streamId: "hot-swap",
        nodeId: "system",
        eventType: "status",
        content: `Pipeline spec hot-swapped: ${candidate.phases.length} phases loaded`,
        timestamp: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      this.onEvent({ type: "chat:error", code: "HOT_SWAP_FAILED", message: `Pipeline spec mutation failed: ${(error as Error).message}`, retryable: true });
      return false;
    }
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
      if (this.llmProvider) {
        // SA4E-182: Detect actual context window from model server before building graph
        if ((this.llmProvider as any).detectContextWindow) {
          try { await (this.llmProvider as any).detectContextWindow(); } catch { /* non-fatal */ }
        }
        // LLM-based pipeline extraction is best-effort: if it fails (LLM
        // timeout, malformed JSON, provider offline), fall back to the
        // static agent registry phases instead of crashing the engine.
        try {
          await agentRegistry.loadPipeline(this.workspaceRoot, this.llmProvider);
        } catch (err) {
          this.streamHandler.emitDirect({
            type: "chat:streamChunk",
            streamId: "pipeline-init",
            nodeId: "system",
            eventType: "status",
            content: `Pipeline extraction failed, using static phases: ${(err as Error).message}`,
            timestamp: new Date().toISOString(),
          });
        }
      }
      this.graph = await buildPipelineGraph(this.mcpBridge, this.streamHandler, this.checkpointer, this.llmProvider, this.hookEngine, this.agentConfigResolver, this.diagnosticsFeed, this.approvalGate, this.commandPatternMatcher);
    }
    return this.graph;
  }
  /** Start a new pipeline execution */
  async invoke(ticketKey: string, phase: SDLCPhase, chatInput: string, intent?: PipelineIntent, autonomyLevel?: AutonomyLevel): Promise<void> {
    const graph = await this.ensureGraph();
    const threadId = crypto.randomUUID();
    this.activeThread = threadId;
    this.cancelled = false;
    const streamId = `stream-${threadId}-${Date.now()}`;
    const resolvedIntent: PipelineIntent = intent || "sdlc";
    const resolvedAutonomy: AutonomyLevel = autonomyLevel || "L2";

    this.onEvent({ type: "chat:pipelineStatus", status: "running", phase, ticketKey });

    const pipeline = agentRegistry.getPipeline();
    const pipelineDefinition: PipelineDefState | null = pipeline
      ? { phases: pipeline.phases.map(p => ({ id: p.id, agentIds: p.agentIds })) }
      : null;

    const initialState: Partial<PipelineState> = {
      ticketKey, threadId, currentPhase: phase, intent: resolvedIntent,
      autonomyLevel: resolvedAutonomy, pipelineDefinition,
      currentPhaseIndex: 0,
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
      this.onEvent({ type: "chat:error", code: "NO_CHECKPOINT", message: `No saved state for thread "${threadId}". The conversation may have expired or the backend is unavailable. Try starting a new conversation.`, retryable: false });
      this.onEvent({ type: "chat:workingStatus", working: false });
      return;
    }
    try {
      await graph.invoke(null, { configurable: { thread_id: threadId } });
    } catch (error) {
      this.onEvent({ type: "chat:error", code: "RESUME_ERROR", message: (error as Error).message, retryable: true });
    } finally {
      this.onEvent({ type: "chat:workingStatus", working: false });
    }
  }
  /** Handle human approval decision — update state and resume */
  async handleApproval(decision: ApprovalDecision, feedback?: string): Promise<void> {
    if (!this.activeThread) return;
    const graph = await this.ensureGraph();
    const status: PipelineStatus = decision === "reject" || decision === "cancel" ? "cancelled" : "running";
    await graph.invoke(
      { approvalDecision: decision, approvalRequired: false, userFeedback: feedback || null, pipelineStatus: status },
      { configurable: { thread_id: this.activeThread } }
    );
  }

  /** Submit raw natural language feedback for multilingual intent classification.
   *  The pipeline's analyze_input node will classify the intent via LLM + Zod
   *  and set approvalDecision automatically. */
  async submitFeedback(rawInput: string): Promise<void> {
    if (!this.activeThread) return;
    const graph = await this.ensureGraph();
    this.onEvent({ type: "chat:workingStatus", working: true });
    try {
      await graph.invoke(
        {
          rawHumanInput: rawInput,
          userFeedback: rawInput,
          approvalDecision: null,
          approvalRequired: false,
          pipelineStatus: "running",
        },
        { configurable: { thread_id: this.activeThread } }
      );
    } catch (error) {
      this.onEvent({ type: "chat:error", code: "FEEDBACK_ERROR", message: (error as Error).message, retryable: true });
    } finally {
      this.onEvent({ type: "chat:workingStatus", working: false });
    }
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

    // SA4E-185: Clear diagnostics feed session state at new chat session start (BR-5)
    this.diagnosticsFeed.clearSession();

    // SA4E-85 v3.1: Pre-search Backend KB for relevant context (OpenCode style)
    const kbContext = await this.searchKb(chatInput);

    // SA4E-187: manual steering rules activated via command ride the next turn
    const activeSteeringRules = toActiveSteeringRules(getActiveManualRules(this.workspaceRoot));

    const { activeThread } = await executeChat(
      chatInput,
      this.activeTabId,
      this.chatHistoryByTab,
      graph,
      this.streamHandler,
      this.onEvent,
      kbContext,
      activeSteeringRules.length > 0 ? activeSteeringRules : undefined,
    );
    this.activeThread = activeThread;
  }
  /**
   * SA4E-85 v3.1: Search Backend Knowledge Base via MCP before each chat.
   * Returns top results as context string for injection (OpenCode-style KB-first).
   */
  async searchKb(query: string): Promise<string> {
    try {
      const raw = await this.mcpBridge.callTool("mem_search", { query, limit: 6 });
      if (!raw || raw.trim().length === 0) return "";
      return `## Knowledge Base Context\n\n${raw.slice(0, 2000)}`;
    } catch {
      return "";
    }
  }
  /** List persisted pipelines for resume prompt (async — KB query). */
  async listPersistedPipelines(): Promise<PersistedPipelineInfo[]> {
    return this.checkpointer.listPersistedPipelines();
  }
  /** Get all SDLC pipeline node states for visualization */
  getCurrentNodeStates(): PipelineGraphNode[] {
    const allNodes: Array<{ id: string; label: string; phase: string }> = [];

    if (agentRegistry.isInitialized()) {
      for (const id of agentRegistry.getAllAgentIds()) {
        const config = agentRegistry.getAgentConfig(id);
        if (config) {
          allNodes.push({ id, label: config.label, phase: config.phase });
        }
      }
    }

    return allNodes.map(n => ({
      ...n,
      phase: n.phase as SDLCPhase,
      status: "idle" as const,
    }));
  }
  /** Dispose resources */
  dispose(): void {
    this.streamHandler.dispose();
    this.hookEngine.dispose();
    this.approvalGate.dispose();
    this.activeThread = null;
  }
}
