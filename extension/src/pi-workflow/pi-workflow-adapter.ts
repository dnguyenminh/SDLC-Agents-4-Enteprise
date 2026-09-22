import { PiWorkflowEngine } from './pi-workflow';
import { PiStateStore } from './pi-workflow-state-store.js';
import { PiProvider } from './pi-provider.js';
import type { PipelineState } from './types/pi-workflow-state.js';
import type { IServerManager } from '../types/server-types';
import type { ChatExtToWebviewMessage } from '../chat-panel/message-protocol';
import { McpBridge } from '../langgraph/core/mcp-bridge';
import { StreamHandler } from '../langgraph/core/stream-handler';
import { ToolApprovalGate } from '../chat/engine/ToolApprovalGate';
import { CommandPatternMatcher } from '../chat/engine/CommandPatternMatcher';
import type { LlmProvider } from '../langgraph/core/llm-provider';
import { createToolApprovalGateHandler } from './pi-workflow-gate.js';
import { buildCredentialResolver } from './pi-provider-config-bridge.js';
import { detectContextWindowEarlyHelper, getDetectedContextWindowHelper, type ContextProbeState } from './pi-adapter-context-probe.js';
import { PROVIDER_BASE_URL_KEYS } from '../models/LlmProviderConfig';
import type { RemoteCheckpointerStore } from './checkpointer-adapter.js';
import { debugLog, debugError } from '../debug-logger';
import * as vscode from 'vscode';

interface AdapterOptions {
  mcpManager: IServerManager;
  workspaceRoot: string;
  onEvent: (msg: ChatExtToWebviewMessage) => void;
  llmProvider?: LlmProvider;
  diagnosticsFeed?: unknown;
  checkpointerStore?: RemoteCheckpointerStore;
  secrets?: vscode.SecretStorage;
  /** DI: shared Models registry (tests inject the faux provider here). */
  models?: import('@earendil-works/pi-ai').MutableModels;
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
  private secrets?: vscode.SecretStorage;
  private contextProbeState: ContextProbeState = { probeDone: false };
  /** CONCURRENCY-FIX: serializes turns and reports busy instead of overlapping agent runs. */
  private turnInFlight: Promise<void> | undefined;

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
    this.secrets = opts.secrets;
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
      provider: opts.models ? new PiProvider() : undefined,
      models: opts.models,
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
    this.contextProbeState = { probeDone: false, detectedWindow: undefined };
  }

  private async configurePiProvider(): Promise<{ modelUnresolved: boolean; credentialsPresent: boolean }> {
    const config = vscode.workspace?.getConfiguration?.('kiroSdlc');
    const providerId = config?.get?.<string>('llmProvider', 'anthropic') || 'anthropic';

    // FIX 4: read the per-provider base URL the Settings panel writes; empty = default URL
    const baseUrlKey = PROVIDER_BASE_URL_KEYS[providerId];
    const baseUrl = (baseUrlKey ? config?.get?.<string>(baseUrlKey, '') : '') || undefined;

    // FIX A: pass the RAW configuredModelId ("auto"/"") down — the engine resolves
    // the default AFTER init + gateway registration (bridge cannot resolve pre-init).
    // PI-MODEL-FALLBACK: ordered fallback models tried when the primary fails
    // with a transient gateway/upstream error (5xx / timeout / bridge sandbox).
    const fallbackModelIds = config?.get?.<string[]>('llmFallbackModels', []) || [];

    const res = await this.engine.configureProvider({
      credentialResolver: buildCredentialResolver(this.secrets),
      providerId,
      configuredModelId: config?.get?.<string>('llmModel', '') || '',
      baseUrl,
      fallbackModelIds,
    });
    return { modelUnresolved: !!res.modelUnresolved, credentialsPresent: !!res.credentialsPresent };
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

  /** LangGraphEngine-compatible: invoke(ticketKey, phase, chatInput, intent?, autonomyLevel?) */
  async invoke(ticketKey: string, phase: string, chatInput: string, _intent?: unknown, _autonomyLevel?: unknown): Promise<void> {
    const state = this.store.stateFor(ticketKey);
    state.currentPhase = phase || state.currentPhase;
    state.chatHistory = this.store.getHistory() || state.chatHistory;
    await this.runTurn(state, chatInput, ticketKey);
  }

  async invokeChat(chatInput: string): Promise<void> {
    const tab = this.store.activeTab || 'CHAT';
    const state = this.store.get(tab) || this.store.chatStateFor(tab);
    await this.runTurn(state, chatInput, state.ticketKey);
  }

  private async runTurn(state: PipelineState, chatInput: string, ticketKey: string): Promise<void> {
    // CONCURRENCY-FIX: serialize turns. A second invokeChat while one is still running is queued
    // (runs after the current one) and surfaced as a non-fatal notice — never dropped, never overlapped.
    if (this.turnInFlight) {
      this.onEvent({
        type: 'chat:workingStatus',
        working: true,
        label: 'Finishing previous message — your message is queued next.',
      } as ChatExtToWebviewMessage);
    }
    const prev = this.turnInFlight ?? Promise.resolve();
    const exec = prev.catch(() => {}).then(() => this.runTurnOnce(state, chatInput, ticketKey));
    this.turnInFlight = exec.finally(() => {
      if (this.turnInFlight === exec) this.turnInFlight = undefined;
    });
    return this.turnInFlight;
  }

  private async runTurnOnce(state: PipelineState, chatInput: string, ticketKey: string): Promise<void> {
    try {
      // FIX A + B: initialize + seed credentials + register gateway + resolve model (correct order).
      const { modelUnresolved, credentialsPresent } = await this.configurePiProvider();
      // FIX C: PI_MODEL_UNRESOLVED only for the true no-model case (registry has no model).
      if (modelUnresolved) {
        this.onEvent({
          type: 'chat:error', code: 'PI_MODEL_UNRESOLVED',
          message: 'No usable Pi model resolved for this provider. Set kiroSdlc.llmModel to a real registry id, then retry.',
          retryable: true,
        } as ChatExtToWebviewMessage);
        return;
      }
      // FIX C: model resolved but no API key → distinct credentials error (fail-closed).
      if (!credentialsPresent) {
        const providerId = vscode.workspace?.getConfiguration?.('kiroSdlc')?.get?.<string>('llmProvider', 'anthropic') || 'anthropic';
        this.onEvent({
          type: 'chat:error', code: 'PI_CREDENTIALS_MISSING',
          message: `No API key for '${providerId}'. Set kiroSdlc.${providerId}ApiKey in Settings, then retry.`,
          retryable: true,
        } as ChatExtToWebviewMessage);
        return;
      }
      const { result, nextState } = await this.engine.executeTurn(state, chatInput, 'sm-agent');
      this.store.save(ticketKey, nextState as PipelineState);
      this.store.setHistory(nextState.chatHistory || []);
      const turnStart = Date.now();
      let emittedText = false;
      for (const chunk of result.streamChunks || []) {
        if (chunk.type === 'text' && chunk.content) { this.streamHandler.emitToken('pi', chunk.content, null); emittedText = true; }
        else if (chunk.type === 'error' && chunk.error) this.streamHandler.emitError('pi', chunk.error, null);
      }
      // ⛔ ROOT-CAUSE FIX (SA4E-289): the webview opens a streaming node (class "streaming",
      // shows a blinking cursor) on the first token and ONLY closes it on chat:streamComplete.
      // The Pi 'done' chunk was never mapped to streamComplete, so the cursor blinked forever
      // and users could not tell the answer had finished. Emit streamComplete to close the node.
      if (emittedText) {
        this.streamHandler.emitComplete('pi', Date.now() - turnStart, null);
      }
      if (result.error) {
        this.onEvent({ type: 'chat:error', code: result.error.code, message: result.error.message, retryable: true } as ChatExtToWebviewMessage);
      }
    } catch (err) {
      debugError('[PiWorkflowAdapter] turn failed', err as Error);
      this.onEvent({ type: 'chat:error', code: 'PI_TURN_FAILED', message: (err as Error).message, retryable: true } as ChatExtToWebviewMessage);
    }
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
