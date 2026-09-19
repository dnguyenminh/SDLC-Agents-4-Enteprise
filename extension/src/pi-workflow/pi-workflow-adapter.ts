import { PiWorkflowEngine } from './pi-workflow';
import { PiStateStore } from './pi-workflow-state-store.js';
import type { PipelineState } from './types/pi-workflow-state.js';
import { IServerManager } from '../types/server-types';
import { ChatExtToWebviewMessage } from '../chat-panel/message-protocol';
import { McpBridge } from '../langgraph/core/mcp-bridge';
import { StreamHandler } from '../langgraph/core/stream-handler';
import { ToolApprovalGate } from '../chat/engine/ToolApprovalGate';
import { CommandPatternMatcher } from '../chat/engine/CommandPatternMatcher';
import type { LlmProvider } from '../langgraph/core/llm-provider';
import { createToolApprovalGateHandler } from './pi-workflow-gate.js';
import type { RemoteCheckpointerStore } from './checkpointer-adapter.js';
import { debugLog, debugError } from '../debug-logger';

interface AdapterOptions {
  mcpManager: IServerManager;
  workspaceRoot: string;
  onEvent: (msg: ChatExtToWebviewMessage) => void;
  llmProvider?: LlmProvider;
  diagnosticsFeed?: unknown;
  checkpointerStore?: RemoteCheckpointerStore;
}

/**
 * Real adapter exposing legacy LangGraphEngine surface on top of PiWorkflowEngine.
 * Handles SEC-289-03 gateHandler, state threading, and tool integration.
 */
export class PiWorkflowAdapter {
  private readonly mcpBridge: McpBridge;
  private readonly streamHandler: StreamHandler;
  private readonly engine: PiWorkflowEngine;
  private readonly store = new PiStateStore();
  private readonly onEvent: (msg: ChatExtToWebviewMessage) => void;
  private llmProvider?: LlmProvider;
  private detectedContextWindow?: number;
  private contextProbeDone = false;

  public readonly hookEngine = {
    firePromptSubmit: async (_text: string, _streamHandler?: StreamHandler) => {},
    fireAgentStop: async (_streamHandler?: StreamHandler) => {},
    fireAgentStart: async (_agentId: string) => {},
    fireToolApprovalResponse: async (_toolCallId: string, _approved: boolean) => {},
  };
  public readonly approvalGate: ToolApprovalGate;
  public readonly commandPatternMatcher: CommandPatternMatcher;
  public diagnosticsFeed?: unknown;

  constructor(opts: AdapterOptions) {
    this.onEvent = opts.onEvent;
    this.llmProvider = opts.llmProvider;
    this.diagnosticsFeed = opts.diagnosticsFeed;
    this.mcpBridge = new McpBridge(opts.mcpManager);
    this.streamHandler = new StreamHandler((msg) => this.onEvent(msg));
    this.commandPatternMatcher = new CommandPatternMatcher();
    this.approvalGate = new ToolApprovalGate();

    // SEC-289-03: real gate handler -> PiWorkflowEngine never auto-approves silently.
    const gateHandler = createToolApprovalGateHandler(this.approvalGate, this.commandPatternMatcher);

    this.engine = new PiWorkflowEngine({
      gateHandler,
      remoteStore: opts.checkpointerStore,
    });
  }

  setDiagnosticsFeed(feed: unknown): void {
    this.diagnosticsFeed = feed;
  }

  getStreamHandler(): StreamHandler {
    return this.streamHandler;
  }

  setLlmProvider(provider: LlmProvider | undefined): void {
    this.llmProvider = provider;
    this.contextProbeDone = false;
    this.detectedContextWindow = undefined;
  }

  getChatHistory(): any[] {
    return this.store.getHistory();
  }

  setChatHistory(messages: any[], activeTabId = this.store.activeTab): void {
    this.store.setHistory(messages, activeTabId);
  }

  switchActiveTab(tabId: string): void {
    this.store.switchTab(tabId);
  }

  async listAvailableTools(): Promise<Array<{ name: string; description?: string; inputSchema?: unknown }>> {
    try {
      return await this.mcpBridge.listTools();
    } catch (err) {
      debugError('[PiWorkflowAdapter] listAvailableTools failed', err as Error);
      return [];
    }
  }

  async detectContextWindowEarly(): Promise<void> {
    if (this.contextProbeDone) return;
    this.contextProbeDone = true;
    try {
      const p = this.llmProvider;
      if (!p) return;
      if (typeof p.detectContextWindow === 'function') {
        const detected = await p.detectContextWindow();
        const windowSize = typeof detected === 'number' && detected > 0 ? detected : p.getContextWindow();
        if (windowSize > 0) this.detectedContextWindow = windowSize;
      } else if (typeof p.getContextWindow === 'function') {
        const windowSize = p.getContextWindow();
        if (windowSize > 0) this.detectedContextWindow = windowSize;
      }
    } catch (err) {
      debugError('[PiWorkflowAdapter] detectContextWindowEarly failed', err as Error);
    }
  }

  getDetectedContextWindow(): number | undefined {
    if (this.detectedContextWindow !== undefined) return this.detectedContextWindow;
    const p = this.llmProvider;
    if (p && typeof p.getContextWindow === 'function') {
      const w = p.getContextWindow();
      if (w > 0) { this.detectedContextWindow = w; }
    }
    return this.detectedContextWindow;
  }

  /** LangGraphEngine-compatible: invoke(ticketKey, phase, chatInput, intent?, autonomyLevel?) */
  async invoke(ticketKey: string, phase: string, chatInput: string, _intent?: unknown, _autonomyLevel?: unknown): Promise<void> {
    const state = this.store.stateFor(ticketKey);
    state.currentPhase = phase || state.currentPhase;
    state.chatHistory = this.store.getHistory() || state.chatHistory;
    await this.runTurn(state, chatInput, ticketKey);
  }

  async invokeChat(chatInput: string): Promise<void> {
    const tab = this.store.activeTab || 'CHAT';
    const state = this.store.get(tab) || this.store.stateFor(tab);
    await this.runTurn(state, chatInput, state.ticketKey);
  }

  private async runTurn(state: PipelineState, chatInput: string, ticketKey: string): Promise<void> {
    try {
      const { result, nextState } = await this.engine.executeTurn(state, chatInput, 'sm-agent');
      this.store.save(ticketKey, nextState as PipelineState);
      this.store.setHistory(nextState.chatHistory || []);
      for (const chunk of result.streamChunks || []) {
        if (chunk.type === 'text' && chunk.content) this.streamHandler.emitToken('pi', chunk.content, null);
        else if (chunk.type === 'error' && chunk.error) this.streamHandler.emitError('pi', chunk.error, null);
      }
      if (result.error) {
        this.onEvent({ type: 'chat:error', code: result.error.code, message: result.error.message, retryable: true } as ChatExtToWebviewMessage);
      }
    } catch (err) {
      debugError('[PiWorkflowAdapter] turn failed', err as Error);
      this.onEvent({ type: 'chat:error', code: 'PI_TURN_FAILED', message: (err as Error).message, retryable: true } as ChatExtToWebviewMessage);
    }
  }

  async handleApproval(_decision: string, _feedback?: string): Promise<void> {
    // Tool-level approvals are routed through the gate handler; pipeline pause/resume via resume().
  }

  async resume(threadId: string): Promise<void> {
    const loaded = await this.engine.loadPersistedState(threadId);
    if (loaded) {
      this.store.save(loaded.ticketKey, loaded as PipelineState);
    }
  }

  async listPersistedPipelines(): Promise<any[]> {
    return [];
  }

  getCurrentNodeStates(): any[] {
    return [];
  }

  selectAgent(agentId: string | null): { agentId: string | null; agentName: string } {
    if (agentId) {
      this.onEvent({ type: 'chat:agentSwitched', agentId, agentName: agentId } as ChatExtToWebviewMessage);
    }
    return { agentId, agentName: agentId || 'default' };
  }

  cancel(): void {
    for (const s of this.store.all()) { s.pipelineStatus = 'CANCELLED'; }
  }

  dispose(): void {
    this.approvalGate.dispose();
    try { this.streamHandler.dispose(); } catch (err) { debugLog(`[PiWorkflowAdapter] streamHandler dispose: ${(err as Error).message}`); }
    this.store.clear();
  }
}
