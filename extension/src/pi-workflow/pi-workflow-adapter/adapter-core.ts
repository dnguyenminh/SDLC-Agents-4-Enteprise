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
import { buildCredentialResolver, readProviderTurnConfig } from '../pi-provider-config-bridge.js';
import type { RemoteCheckpointerStore } from '../checkpointer-adapter.js';
import { debugLog, debugError } from '../../debug-logger';
import * as vscode from 'vscode';
import { readAgentInfos, parseAgentFrontmatter } from '../../chat-panel/ChatStateManager/fs-helpers.js';
import { ensureSessionHost, evictSessionHost } from '../session-host/registry.js';
import type { SessionHostOptions } from '../session-host/types.js';
import { peerApprovalGateOrUndefined } from '../peer/runtime.js';
import { join } from 'node:path';

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

  /** SA4E-370 S2/S4: tracks which agent is active per tab (tabId -> { agentId, role }). */
  protected readonly activeAgents = new Map<string, { agentId: string; role: string }>();

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

  /** SA4E-370 S3: active tab id for per-tab session/context isolation. */
  getActiveTabId(): string {
    return this.store.activeTab;
  }

  async handleApproval(_decision: string, _feedback?: string): Promise<void> {}
  async listPersistedPipelines(): Promise<any[]> { return []; }
  getCurrentNodeStates(): any[] { return []; }

  async resume(threadId: string): Promise<void> {
    const loaded = await this.engine.loadPersistedState(threadId);
    if (loaded) { this.store.save(loaded.ticketKey, loaded as PipelineState); }
  }

  /**
   * SA4E-370 S2: Real selectAgent wiring. Loads the agent file, parses v2
   * AgentInfo, injects the persona through all governance layers
   * (budget gate → auto-chunk → TurnBudgetGuard → context pipeline), sets
   * SessionHostOptions.role/phase from the agent definition, and activates
   * role-scoped loadout/skills/steering.
   *
   * F02: agentId must exist in the current agent list — otherwise rejected.
   * BR-07: fail-open on role scoping errors — base loadout, no crash.
   * BR-01/BR-02: persona injection goes through ALL governance layers; no bypass.
   */
  async selectAgent(agentId: string | null): Promise<{
    agentId: string | null;
    agentName: string;
    success: boolean;
    tabId: string;
    sessionRole?: string;
    sessionPhase?: string;
    error?: string;
  }> {
    const tabId = this.store.activeTab || 'CHAT';
    const previous = this.activeAgents.get(tabId);
    const previousAgentId = previous?.agentId ?? null;
    const previousAgentName = previous?.agentId ?? 'default';

    if (!agentId) {
      this.activeAgents.delete(tabId);
      this.onEvent({
        type: 'chat:agentSwitched',
        agentId: previousAgentId,
        agentName: previousAgentName,
        success: true,
        tabId,
      } as ChatExtToWebviewMessage);
      return { agentId: previousAgentId, agentName: previousAgentName, success: true, tabId };
    }

    // F02: validate agentId exists in current agent list
    const agents = readAgentInfos(this.workspaceRoot);
    const agentInfo = agents.find((a) => a.id === agentId);
    if (!agentInfo) {
      const msg = `Agent '${agentId}' not found. Keeping current agent.`;
      debugLog(`[PiWorkflowAdapter] selectAgent: ${msg}`);
      this.onEvent({
        type: 'chat:agentSwitched',
        agentId: previousAgentId,
        agentName: previousAgentName,
        success: false,
        tabId,
        error: msg,
      } as ChatExtToWebviewMessage);
      return { agentId: previousAgentId, agentName: previousAgentName, success: false, tabId, error: msg };
    }

    // Load + parse the agent file directly (single source of truth for v2 fields)
    const fs = require('fs');
    const agentFile = join(this.workspaceRoot, '.code-intel', 'agents', `${agentId}.md`);
    let content: string;
    try {
      content = fs.readFileSync(agentFile, 'utf-8');
    } catch (err) {
      const msg = `Failed to load agent '${agentId}': ${(err as Error).message}. Keeping current agent.`;
      debugLog(`[PiWorkflowAdapter] selectAgent: ${msg}`);
      this.onEvent({
        type: 'chat:agentSwitched',
        agentId: previousAgentId,
        agentName: previousAgentName,
        success: false,
        tabId,
        error: msg,
      } as ChatExtToWebviewMessage);
      return { agentId: previousAgentId, agentName: previousAgentName, success: false, tabId, error: msg };
    }

    let parsed: { name: string; description: string; role?: string; phase?: string; model?: string; personaBody: string };
    try {
      parsed = parseAgentFrontmatter(content, agentId);
    } catch (err) {
      debugLog(`[PiWorkflowAdapter] selectAgent: parse fallback for ${agentId}: ${(err as Error).message}`);
      parsed = { name: agentId, description: '', personaBody: content };
    }

    // Evict any existing session for this tab so the new role/phase/persona take effect
    evictSessionHost(this.workspaceRoot, tabId);

    // Resolve provider config for ensureSessionHost
    // SA4E-369 UAT fix: ONE shared config read (dot keys + flat fallback) and
    // the per-provider gateway baseUrl — previously MISSING here, so a
    // host created by an agent switch could never resolve a gateway model
    // (keyless local providers would have failed PI_MODEL_UNRESOLVED here).
    const { providerId, baseUrl, configuredModelId } = readProviderTurnConfig();
    const resolver = this.secrets ? buildCredentialResolver(this.secrets) : undefined;
    const apiKey = resolver ? await resolver(providerId) : undefined;

    try {
      const hostOpts: SessionHostOptions & { tabId: string } = {
        workspaceRoot: this.workspaceRoot,
        tabId,
        providerId,
        apiKey,
        baseUrl,
        configuredModelId,
        role: parsed.role,      // FR-07: role from agent definition (not hardcoded 'sm-agent')
        phase: parsed.phase,    // FR-07: phase from agent definition
        personaBody: parsed.personaBody, // FR-01/FR-06: persona injected as system prompt
        activeAgentId: agentId,  // S4: track driving agent for badge + history
        mcpBridge: this.mcpBridge,
        nCtxDetected: this.getDetectedContextWindow(),
        // SA4E-369 S-02 (a): user-path host creation carries the fail-closed
        // peer approval gate too (first-winner cache — see trySessionTurn).
        peerApprovalGate: peerApprovalGateOrUndefined(),
      };
      await ensureSessionHost(hostOpts);

      this.activeAgents.set(tabId, { agentId, role: parsed.role ?? '' });
      debugLog(`[PiWorkflowAdapter] selectAgent: tab=${tabId} agent=${agentId} role=${parsed.role ?? '(default)'} phase=${parsed.phase ?? '(default)'}`);

      this.onEvent({
        type: 'chat:agentSwitched',
        agentId,
        agentName: parsed.name,
        success: true,
        tabId,
        sessionRole: parsed.role,
        sessionPhase: parsed.phase,
      } as ChatExtToWebviewMessage);

      return { agentId, agentName: parsed.name, success: true, tabId, sessionRole: parsed.role, sessionPhase: parsed.phase };
    } catch (err) {
      // BR-07: fail-open — keep current agent, return error, no crash
      const msg = `Agent switch failed: ${(err as Error).message}. Keeping current agent.`;
      debugError('[PiWorkflowAdapter] selectAgent wiring failed', err as Error);
      this.onEvent({
        type: 'chat:agentSwitched',
        agentId: previousAgentId,
        agentName: previousAgentName,
        success: false,
        tabId,
        error: msg,
      } as ChatExtToWebviewMessage);
      return { agentId: previousAgentId, agentName: previousAgentName, success: false, tabId, error: msg };
    }
  }

  /**
   * Cancel root-cause fix: flipping pipelineStatus only painted the UI while
   * the AgentSession kept streaming the in-flight LLM request and firing the
   * next ones (zombie turn — requests kept hitting the LLM server after the
   * user pressed Cancel). Now the active tab's host is ABORTED too: the SDK
   * settles the run (stopReason "aborted"), promptTurn resolves, and the
   * single-flight turn chain releases.
   */
  cancel(): void {
    for (const s of this.store.all()) { s.pipelineStatus = 'CANCELLED'; }
    const tabId = this.store.activeTab;
    if (tabId) {
      void import('../session-host/registry.js').then(m => m.abortSessionHost(this.workspaceRoot, tabId)).catch(() => {});
    }
  }

  dispose(): void {
    this.approvalGate.dispose();
    try { this.streamHandler.dispose(); } catch (err) { debugLog(`[PiWorkflowAdapter] streamHandler dispose: ${(err as Error).message}`); }
    this.store.clear();
  }
}
