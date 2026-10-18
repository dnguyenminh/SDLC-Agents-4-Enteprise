/**
 * PiWorkflowAdapter core — state, wiring (SEC-289-03 gateHandler), and the
 * simple store/probe accessors. Turn orchestration lives in
 * ./adapter-session-turns.ts and ./adapter-legacy-turns.ts.
 */
import { PiWorkflowEngine } from '../pi-workflow';
import { PiStateStore } from '../pi-workflow-state-store.js';
import { PiProvider } from '../pi-provider.js';
import type { PipelineState } from '../types/pi-workflow-state.js';
import type { IServerManager } from '../../types/server-types';
import type { ChatExtToWebviewMessage, AutopilotMode } from '../../chat-panel/message-protocol';
import { McpBridge } from '../../mcp/mcp-bridge';
import { StreamHandler } from '../../mcp/stream-handler';
import { ToolApprovalGate } from '../../chat/engine/ToolApprovalGate';
import { CommandPatternMatcher } from '../../chat/engine/CommandPatternMatcher';
import type { LlmProvider } from '../../mcp/llm-provider';
import { createToolApprovalGateHandler } from '../pi-workflow-gate.js';
import { detectContextWindowEarlyHelper, getDetectedContextWindowHelper, type ContextProbeState } from '../pi-adapter-context-probe.js';
import type { RemoteCheckpointerStore } from '../checkpointer-adapter.js';
import { debugLog, debugError } from '../../debug-logger';
import * as vscode from 'vscode';

interface AdapterOptions {
  mcpManager: IServerManager;
  workspaceRoot: string;
  onEvent: (msg: ChatExtToWebviewMessage) => void;
  llmProvider?: LlmProvider;
  checkpointerStore?: RemoteCheckpointerStore;
  secrets?: vscode.SecretStorage;
  /** DI: shared Models registry (tests inject the faux provider here). */
  models?: import('@earendil-works/pi-ai').MutableModels;
}

/**
 * Real adapter exposing legacy LangGraphEngine surface on top of PiWorkflowEngine.
 * Handles SEC-289-03 gateHandler, state threading, and tool integration.
 */
export class AdapterCore {
  protected readonly mcpBridge: McpBridge;
  protected readonly streamHandler: StreamHandler;
  protected readonly engine: PiWorkflowEngine;
  protected readonly store = new PiStateStore();
  protected readonly onEvent: (msg: ChatExtToWebviewMessage) => void;
  /** SA4E-333: workspace root — was dropped at this boundary, now stored. */
  protected readonly workspaceRoot: string;
  protected llmProvider?: LlmProvider;
  protected secrets?: vscode.SecretStorage;
  protected contextProbeState: ContextProbeState = { probeDone: false };
  /** CONCURRENCY-FIX: serializes turns and reports busy instead of overlapping agent runs. */
  protected turnInFlight: Promise<void> | undefined;

  public readonly hookEngine = {
    firePromptSubmit: async (_text: string, _streamHandler?: StreamHandler) => {},
    fireAgentStop: async (_streamHandler?: StreamHandler) => {},
    fireAgentStart: async (_agentId: string) => {},
    fireToolApprovalResponse: async (_toolCallId: string, _approved: boolean) => {},
  };
  public readonly approvalGate: ToolApprovalGate;
  public readonly commandPatternMatcher: CommandPatternMatcher;
  /** Fix J: live Autopilot/Supervised mode — read by the gate handler per request. */
  protected autopilotMode: AutopilotMode = 'autopilot';

  /** Fix J: MessageHandler forwards chat:setMode here so the gate honors it. */
  setAutopilotMode(mode: AutopilotMode): void {
    this.autopilotMode = mode;
  }

  constructor(opts: AdapterOptions) {
    this.onEvent = opts.onEvent;
    this.workspaceRoot = opts.workspaceRoot;
    this.llmProvider = opts.llmProvider;
    this.secrets = opts.secrets;
    this.mcpBridge = new McpBridge(opts.mcpManager);
    this.streamHandler = new StreamHandler((msg) => this.onEvent(msg));
    this.commandPatternMatcher = new CommandPatternMatcher();
    this.approvalGate = new ToolApprovalGate();

    // SEC-289-03 + Fix J (§5d): mode-aware gate handler. Autopilot auto-approves
    // non-destructive tools (bash/write/edit); Supervised (and destructive ops
    // in any mode) block and surface Approve/Reject on the working bar —
    // otherwise the turn looks hung (UAT: every bash call pended an approval
    // nobody was ever asked for).
    const gateHandler = createToolApprovalGateHandler(this.approvalGate, this.commandPatternMatcher, {
      getMode: () => this.autopilotMode,
      onApprovalPending: (toolName, toolUseId) => {
        this.onEvent({
          type: 'chat:workingStatus',
          working: true,
          label: `Waiting approval: ${toolName} (auto-rejects on timeout)`,
        } as ChatExtToWebviewMessage);
        this.onEvent({
          type: 'chat:toolApprovalPending',
          toolId: toolUseId,
          toolName,
        } as ChatExtToWebviewMessage);
      },
    });

    this.engine = new PiWorkflowEngine({
      gateHandler,
      remoteStore: opts.checkpointerStore,
      provider: opts.models ? new PiProvider() : undefined,
      models: opts.models,
    });
  }

  getStreamHandler(): StreamHandler {
    return this.streamHandler;
  }

  setLlmProvider(provider: LlmProvider | undefined): void {
    this.llmProvider = provider;
    this.contextProbeState = { probeDone: false, detectedWindow: undefined };
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
    await detectContextWindowEarlyHelper(this.llmProvider, this.contextProbeState);
  }

  getDetectedContextWindow(): number | undefined {
    return getDetectedContextWindowHelper(this.llmProvider, this.contextProbeState);
  }

  /** Expose workspace root (SA4E-333) — chat can answer "where am I". */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  async handleApproval(_decision: string, _feedback?: string): Promise<void> {}
  async listPersistedPipelines(): Promise<any[]> { return []; }
  getCurrentNodeStates(): any[] { return []; }

  async resume(threadId: string): Promise<void> {
    const loaded = await this.engine.loadPersistedState(threadId);
    if (loaded) { this.store.save(loaded.ticketKey, loaded as PipelineState); }
  }

  selectAgent(agentId: string | null): { agentId: string | null; agentName: string } {
    if (agentId) { this.onEvent({ type: 'chat:agentSwitched', agentId, agentName: agentId } as ChatExtToWebviewMessage); }
    return { agentId, agentName: agentId || 'default' };
  }

  cancel(): void { for (const s of this.store.all()) { s.pipelineStatus = 'CANCELLED'; } }

  dispose(): void {
    this.approvalGate.dispose();
    try { this.streamHandler.dispose(); } catch (err) { debugLog(`[PiWorkflowAdapter] streamHandler dispose: ${(err as Error).message}`); }
    this.store.clear();
  }
}
