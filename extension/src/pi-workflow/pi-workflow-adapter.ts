import { PiWorkflowEngine } from './pi-workflow';
import * as crypto from 'node:crypto';
import { PiStateStore } from './pi-workflow-state-store.js';
import { PiProvider } from './pi-provider.js';
import type { PipelineState } from './types/pi-workflow-state.js';
import type { IServerManager } from '../types/server-types';
import type { ChatExtToWebviewMessage, AutopilotMode } from '../chat-panel/message-protocol';
import { McpBridge } from '../mcp/mcp-bridge';
import { StreamHandler } from '../mcp/stream-handler';
import { ToolApprovalGate } from '../chat/engine/ToolApprovalGate';
import { CommandPatternMatcher } from '../chat/engine/CommandPatternMatcher';
import type { LlmProvider } from '../mcp/llm-provider';
import { createToolApprovalGateHandler } from './pi-workflow-gate.js';
import { buildWorkspaceSystemPrompt, createWorkspaceTools } from './pi-coding-tools.js';
import { providerRequiresApiKey, hintLocalEndpointError, getExtensionVersion } from './pi-provider-config-bridge.js';
import type { ToolLiveEvent } from './pi-event-mapper.js';
import { getPiExtensionAgentTools } from './pi-extension-runtime.js';
import { runContextPipeline } from './pi-context-pipeline.js';
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
  /** SA4E-333: workspace root — was dropped at this boundary, now stored. */
  private readonly workspaceRoot: string;
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
  /** Fix J: live Autopilot/Supervised mode — read by the gate handler per request. */
  private autopilotMode: AutopilotMode = 'autopilot';

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

  private async configurePiProvider(): Promise<{ modelUnresolved: boolean; credentialsPresent: boolean }> {
    const config = vscode.workspace?.getConfiguration?.('sdlcAgents');
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

  /** Expose workspace root (SA4E-333) — chat can answer "where am I". */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Forward live tool activity to the sidebar tool-block UI (progress).
   * The webview already renders chat:toolCall/toolCallUpdate — the host
   * just never sent them, so tool-heavy turns looked frozen. Transient
   * only (not persisted to tab history); never throws into the turn.
   */
  private postToolLiveEvent(e: ToolLiveEvent): void {
    try {
      if (e.phase === 'start') {
        this.onEvent({
          type: 'chat:toolCall',
          toolCall: { id: e.id, name: e.name, args: e.args, status: 'running' },
        } as ChatExtToWebviewMessage);
      } else {
        this.onEvent({
          type: 'chat:toolCallUpdate',
          id: e.id,
          status: e.isError ? 'failed' : 'completed',
          duration: e.durationMs,
          result: e.result,
        } as ChatExtToWebviewMessage);
      }
    } catch {
      // Progress display must never break turns.
    }
  }

  /**
   * SA4E-334 Option A: route the turn through a real AgentSession
   * (workspace-local .jsonl transcript so billion-context pairs its
   * .acp.json sidecar). Returns true when the session handled the turn.
   * Any failure returns false and the caller uses the legacy engine path.
   *
   * Routing: session-first ONLY for key-requiring (cloud) providers with a
   * real key. Local endpoints (lmstudio/ollama/onnx) ALWAYS use the legacy
   * gateway path — pi-ai has no builtin provider for them and ModelRuntime
   * cannot compose auth ("Provider is not configured"), while legacy
   * createGatewayProvider builds a complete OpenAI-compatible provider
   * (real /v1/models + Chat Completions) that works keyless.
   */
  private async trySessionTurn(
    state: PipelineState,
    chatInput: string,
    ticketKey: string,
    timeoutMs = 0,
    turnStreamId: string
  ): Promise<boolean> {
    try {
      const config = vscode.workspace?.getConfiguration?.('sdlcAgents');
      const providerId = config?.get?.<string>('llmProvider', 'anthropic') || 'anthropic';
      if (!providerRequiresApiKey(providerId)) return false; // local → legacy gateway path
      const baseUrlKey = PROVIDER_BASE_URL_KEYS[providerId];
      const baseUrl = (baseUrlKey ? config?.get?.<string>(baseUrlKey, '') : '') || undefined;
      const configuredModelId = config?.get?.<string>('llmModel', '') || '';
      const resolver = this.secrets ? buildCredentialResolver(this.secrets) : undefined;
      const apiKey = resolver ? await resolver(providerId) : undefined;
      // Key-requiring providers without a key keep the fail-closed
      // PI_CREDENTIALS_MISSING error on the legacy path below.
      if (!apiKey) return false;
      const { ensureSessionHost } = await import('./pi-agent-session-host.js');
      const host = await ensureSessionHost({
        workspaceRoot: this.workspaceRoot,
        providerId,
        apiKey,
        baseUrl,
        configuredModelId,
      });
      const turnStart = Date.now();
      // One stable stream identity per turn (streaming-identity fix):
      // every token/complete/error of this turn shares turnStreamId so the
      // webview opens exactly ONE bubble and always closes it.
      // Session turns have no in-loop abort (AgentSession API) — bound the
      // wait instead. Late completions are dropped via live=false so a timed
      // out session can never bleed tokens into a later turn. Timeout claims
      // the turn (return true) to avoid double-executing via legacy fallback.
      const streamId = turnStreamId;
      let live = true;
      // timeoutMs <= 0 → NO wall-clock backstop (product decision: stop only on
      // repetition, never elapsed time). Only race a timeout when opt-in (>0).
      const promptPromise = host.promptTurn(
        chatInput,
        (token) => {
          if (!live) return;
          this.streamHandler.emitToken('pi', token, streamId);
        },
        (e) => {
          if (!live) return;
          this.postToolLiveEvent(e);
        }
      );
      let res;
      try {
        if (timeoutMs > 0) {
          const timeout = new Promise<never>((_, reject) => {
            const t = setTimeout(
              () => reject(new Error(`PI_SESSION_TIMEOUT after ${timeoutMs}ms`)),
              timeoutMs
            );
            (t as unknown as { unref?: () => void }).unref?.();
          });
          res = await Promise.race([promptPromise, timeout]);
        } else {
          res = await promptPromise;
        }
      } catch (err) {
        live = false;
        if ((err as Error).message.startsWith('PI_SESSION_TIMEOUT')) {
          this.streamHandler.emitComplete('pi', Date.now() - turnStart, streamId);
          this.onEvent({
            type: 'chat:error',
            code: 'PI_SESSION_TIMEOUT',
            message: `Session turn timed out after ${Math.round(timeoutMs / 1000)}s. Narrow the scope and retry.`,
            retryable: true,
          } as ChatExtToWebviewMessage);
          return true;
        }
        throw err;
      }
      // Always close the stream, even for textless turns (tool-only output
      // still opened a bubble that must be closed).
      this.streamHandler.emitComplete('pi', Date.now() - turnStart, streamId);
      // Mirror the turn into the lightweight store (context usage + fallback coherence).
      const history = [...(this.store.getHistory() || state.chatHistory || [])];
      history.push({ role: 'user', content: chatInput } as never);
      if (res.text) history.push({ role: 'assistant', content: res.text } as never);
      this.store.setHistory(history as never);
      this.store.save(ticketKey, { ...state, chatHistory: history } as PipelineState);
      if (res.sessionFile) {
        debugLog(`[Chat] turn via=session ext=${getExtensionVersion()} workspace=${this.workspaceRoot} file=${res.sessionFile} tools=${res.toolCalls.length} text=${res.text.length}ch`);
      }
      return true;
    } catch (err) {
      debugLog(`[PiWorkflowAdapter] session turn fallback: ${(err as Error).message.slice(0, 160)}`);
      return false;
    }
  }

  private async runTurnOnce(state: PipelineState, chatInput: string, ticketKey: string): Promise<void> {
    try {
      // Loop guard budget: REPETITION-ONLY by design (product decision).
      // A turn is NEVER stopped by elapsed time — only when a tool/failure/text
      // signature repeats (result no longer changes). sdlcAgents.backend.chatTimeout
      // defaults to 0 = wall-clock timeout DISABLED; set a positive value to opt
      // back into a wall-clock backstop. maxToolRepeats (default 4) still applies.
      const chatTimeoutRaw = vscode.workspace
        ?.getConfiguration?.('sdlcAgents')
        ?.get?.<number>('backend.chatTimeout', 0);
      const chatTimeoutMs =
        Number.isFinite(chatTimeoutRaw) && (chatTimeoutRaw as number) > 0
          ? (chatTimeoutRaw as number)
          : 0; // 0 = no wall-clock timeout
      const maxRepeatsRaw = vscode.workspace
        ?.getConfiguration?.('sdlcAgents')
        ?.get?.<number>('turn.maxToolRepeats', 4);
      const turnBudget = {
        timeoutMs: chatTimeoutMs,
        maxSameToolRepeats: maxRepeatsRaw,
      };
      // SA4E-334 Option A: AgentSession-first (real .jsonl + sidecar pairing).
      // MUST run before legacy configurePiProvider gating — the legacy gate
      // rejects providers the session path can serve (and vice versa).
      // Falls back to the legacy engine path below on any failure.
      // turnStreamId (below) is the single identity for every stream event.
      const turnStreamId = crypto.randomUUID();
      if (await this.trySessionTurn(state, chatInput, ticketKey, chatTimeoutMs, turnStreamId)) return;
      // FIX A + B: initialize + seed credentials + register gateway + resolve model (correct order).
      const { modelUnresolved, credentialsPresent } = await this.configurePiProvider();
      // FIX C: PI_MODEL_UNRESOLVED only for the true no-model case (registry has no model).
      if (modelUnresolved) {
        this.onEvent({
          type: 'chat:error', code: 'PI_MODEL_UNRESOLVED',
          message: 'No usable Pi model resolved for this provider. Set sdlcAgents.llmModel to a real registry id, then retry.',
          retryable: true,
        } as ChatExtToWebviewMessage);
        return;
      }
      // FIX C: model resolved but no API key → distinct credentials error (fail-closed).
      if (!credentialsPresent) {
        const providerId = vscode.workspace?.getConfiguration?.('sdlcAgents')?.get?.<string>('llmProvider', 'anthropic') || 'anthropic';
        this.onEvent({
          type: 'chat:error', code: 'PI_CREDENTIALS_MISSING',
          message: `No API key for '${providerId}'. Set sdlcAgents.${providerId}ApiKey in Settings, then retry.`,
          retryable: true,
        } as ChatExtToWebviewMessage);
        return;
      }
      // SA4E-333/334 legacy path: workspace-aware tools + systemPrompt.
      // (Session-first already ran at the top of this method.)
      const systemPrompt = buildWorkspaceSystemPrompt(this.workspaceRoot);
      const builtinTools = await createWorkspaceTools(this.workspaceRoot);
      let extTools: unknown[] = [];
      try {
        const ext = await getPiExtensionAgentTools(this.workspaceRoot, (msg) => this.onEvent(msg));
        extTools = ext.tools as unknown[];
        if (ext.loaded.length > 0) {
          debugLog(`[PiWorkflowAdapter] extensions loaded=${ext.loaded.length} tools=${ext.tools.length} skipped=${ext.skipped.length}`);
        }
      } catch (err) {
        debugLog(`[PiWorkflowAdapter] extension runtime skipped: ${(err as Error).message}`);
      }
      const byName = new Map<string, unknown>();
      for (const t of [...(builtinTools as unknown[]), ...extTools]) {
        const name = (t as { name?: unknown }).name;
        if (typeof name === 'string' && name) byName.set(name, t); // extension wins (AFT hoist)
      }
      const tools = [...byName.values()] as unknown as import('./types/executor.types.js').ExecuteTurnInput['tools'];
      const workspaceRoot = this.workspaceRoot;
      const onEvent = (msg: ChatExtToWebviewMessage) => this.onEvent(msg);
      const { result, nextState } = await this.engine.executeTurn(state, chatInput, 'sm-agent', {
        tools,
        systemPrompt,
        contextRunner: (msgs) => runContextPipeline(workspaceRoot, msgs, onEvent),
        turnBudget,
        onToolEvent: (e) => this.postToolLiveEvent(e),
      });
      debugLog(`[Chat] turn via=legacy ext=${getExtensionVersion()} workspace=${this.workspaceRoot} tools=${byName.size} used=${result.toolCalls.length} systemPrompt=${systemPrompt.length}ch`);
      this.store.save(ticketKey, nextState as PipelineState);
      this.store.setHistory(nextState.chatHistory || []);
      const turnStart = Date.now();
      for (const chunk of result.streamChunks || []) {
        if (chunk.type === 'text' && chunk.content) { this.streamHandler.emitToken('pi', chunk.content, turnStreamId); }
        else if (chunk.type === 'error' && chunk.error) this.streamHandler.emitError('pi', chunk.error, turnStreamId);
      }
      // ⛔ ROOT-CAUSE FIX (SA4E-289) + streaming-identity fix: ALWAYS close the
      // stream with the SAME turnStreamId — even textless (tool-only) turns
      // opened a bubble that must be closed, or the cursor blinks forever.
      this.streamHandler.emitComplete('pi', Date.now() - turnStart, turnStreamId);
      if (result.error) {
        // Local endpoints: enrich raw HTTP errors with the endpoint checklist
        // (UAT otherwise gets an bare "HTTP 401" with nothing actionable).
        try {
          const config = vscode.workspace?.getConfiguration?.('sdlcAgents');
          const providerId = config?.get?.<string>('llmProvider', 'anthropic') || 'anthropic';
          if (!providerRequiresApiKey(providerId)) {
            const baseUrlKey = PROVIDER_BASE_URL_KEYS[providerId];
            const baseUrl = (baseUrlKey ? config?.get?.<string>(baseUrlKey, '') : '') || undefined;
            const modelId = config?.get?.<string>('llmModel', '') || undefined;
            result.error.message = hintLocalEndpointError(result.error.message, providerId, baseUrl, modelId);
          }
        } catch { /* never break error reporting */ }
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
