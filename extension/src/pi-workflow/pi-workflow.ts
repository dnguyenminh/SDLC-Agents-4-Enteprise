import { PiProvider, type IPiProvider, type CredentialResolver } from './pi-provider.js';
import { PiAgentExecutor } from './pi-agent-executor.js';
import { PhaseRouter, type Intent } from './phase-router.js';
import { StateAdapter } from './state-adapter.js';
import { CheckpointerAdapter, type RemoteCheckpointerStore } from './checkpointer-adapter.js';
import { ApprovalAdapter, type ToolApprovalGateHandler } from './approval-adapter.js';
import type { PipelineState, PiInternalState } from './types/pi-workflow-state.js';
import type { PiAgentExecutionResult, NormalizedToolCall } from './types/executor.types.js';
import type { MutableModels } from '@earendil-works/pi-ai';

export interface PiWorkflowConfig {
  provider?: IPiProvider;
  remoteStore?: RemoteCheckpointerStore;
  gateHandler?: ToolApprovalGateHandler;
  /** DI: shared Models registry (tests inject the faux provider here). */
  models?: MutableModels;
}

export interface ConfigureProviderOptions {
  credentialResolver?: CredentialResolver;
  providerId?: string;
  /** FIX A: the RAW configured model value (kiroSdlc.llmModel, may be "" or "auto"). */
  configuredModelId?: string;
  /** FIX 4: custom OpenAI-compatible gateway base URL (e.g. http://localhost:20128/v1). */
  baseUrl?: string;
  /** PI-MODEL-FALLBACK: ordered fallback model ids tried on transient gateway errors. */
  fallbackModelIds?: string[];
}

export interface ConfigureProviderResult {
  resolvedModelId?: string;
  modelUnresolved?: boolean;
  /** FIX C: whether the credential resolver yielded an API key (seeded into pi-ai auth). */
  credentialsPresent?: boolean;
}

export class PiWorkflowEngine {
  private provider: IPiProvider;
  private executor: PiAgentExecutor;
  private router: PhaseRouter;
  private stateAdapter: StateAdapter;
  private checkpointer: CheckpointerAdapter;
  private approvalAdapter: ApprovalAdapter;
  private initialized = false;
  /** FIX A: resolved model identity threaded to the executor (engine is UI-agnostic — adapter supplies). */
  private resolvedProviderId?: string;
  private resolvedModelId?: string;
  private models?: MutableModels;

  constructor(config: PiWorkflowConfig = {}) {
    this.provider = config.provider || new PiProvider();
    this.models = config.models;
    this.executor = new PiAgentExecutor(this.provider);
    this.router = new PhaseRouter();
    this.stateAdapter = new StateAdapter();
    this.checkpointer = new CheckpointerAdapter(config.remoteStore);
    this.approvalAdapter = new ApprovalAdapter(config.gateHandler);
  }

  async initialize(transportType: 'WebSocket' | 'HTTP' = 'HTTP'): Promise<void> {
    if (this.initialized) return;
    await this.provider.initialize({ transportType, models: this.models });
    this.initialized = true;
  }

  /** Idempotent lazy-init — guarantees the provider is ready before executeTurn. */
  async ensureInitialized(): Promise<void> {
    await this.initialize('HTTP');
  }

  /** Public accessor for the Pi provider (credential/model bridging by the adapter). */
  getProvider(): IPiProvider {
    return this.provider;
  }

  /**
   * FIX A + B + C + 2 + 4: bridge runtime credentials + model + gateway into the
   * underlying provider, in the correct ORDER (init → seed → gateway → resolve).
   * Public API — the adapter never reaches into private fields.
   */
  async configureProvider(opts: ConfigureProviderOptions): Promise<ConfigureProviderResult> {
    // 1. Registry populated (builtinModels) — must happen BEFORE any resolve.
    await this.ensureInitialized();
    const p = this.provider as PiProvider;

    if (opts.credentialResolver) {
      p.setCredentialResolver(opts.credentialResolver);
    }
    // 2. Resolve the API key ONCE — used for both seeding the credentials store
    //    and fetching the gateway's real model list (auth required).
    // No resolver (no SecretStorage) = nothing to verify — don't block (tests).
    let credentialsPresent = true;
    let apiKey: string | undefined;
    if (opts.credentialResolver && opts.providerId) {
      apiKey = await opts.credentialResolver(opts.providerId);
      if (apiKey) {
        await p.seedCredentials(opts.providerId, apiKey);
        credentialsPresent = true;
      } else {
        credentialsPresent = false;
      }
    }
    // 3. Register the gateway under the REAL providerId BEFORE resolving (FIX B),
    //    fetched WITH the API key so the gateway's real models (incl. auto) populate the registry.
    if (opts.baseUrl && opts.providerId) {
      await p.registerGateway(opts.providerId, opts.baseUrl, apiKey);
    }

    // 4. FIX 2 (PI-GATEWAY-MODEL-FIX): honor the user's selected model, INCLUDING "auto",
    //    when it exists in the gateway-backed registry. Only resolve a default when the
    //    configured id is empty OR not found in the registry.
    const configuredId = opts.configuredModelId?.trim();
    const configuredExists = configuredId
      ? !!(opts.providerId && await p.setModel(opts.providerId, configuredId))
      : false;

    if (configuredExists) {
      // FIX 3: a valid configured model (e.g. gateway "auto") — use it as-is, never trigger PI_MODEL_UNRESOLVED.
      this.resolvedProviderId = opts.providerId;
      this.resolvedModelId = configuredId;
      this.applyFallbackChain(p, opts.providerId, configuredId, opts.fallbackModelIds);
      return { resolvedModelId: configuredId, modelUnresolved: false, credentialsPresent };
    }

    // FIX 2b: empty or not-found configured id → resolve a default (prefers gateway registry models).
    let modelId = p.resolveDefaultModel(opts.providerId!) ?? undefined;

    // FIX C: modelUnresolved ONLY for the true case — no model anywhere (gateway + static).
    let modelUnresolved = true;
    if (opts.providerId && modelId) {
      modelUnresolved = !(await p.setModel(opts.providerId, modelId));
    }

    this.resolvedProviderId = opts.providerId;
    this.resolvedModelId = modelId;
    this.applyFallbackChain(p, opts.providerId, modelId, opts.fallbackModelIds);
    return { resolvedModelId: modelId, modelUnresolved, credentialsPresent };
  }

  /**
   * PI-MODEL-FALLBACK: register the ordered fallback chain on the provider.
   * The primary (resolved) model leads; configured fallbacks follow. When the
   * primary is a gateway "auto/*" combo, we still append explicit single-model
   * fallbacks so a totally-dead combo can recover onto a concrete model.
   */
  private applyFallbackChain(
    p: PiProvider,
    providerId?: string,
    primaryModelId?: string,
    fallbackModelIds?: string[]
  ): void {
    if (!providerId) return;
    const chain: string[] = [];
    if (primaryModelId) chain.push(primaryModelId);
    for (const id of fallbackModelIds ?? []) { if (id?.trim()) chain.push(id.trim()); }
    p.setFallbackModels(providerId, chain);
  }

  async executeTurn(
    currentState: PipelineState,
    inputMessage: string,
    agentId: string
  ): Promise<{ result: PiAgentExecutionResult; nextState: PiInternalState }> {
    const piState = this.stateAdapter.toPiState(currentState);
    // 2. Immutability fix: create new array instead of mutating currentState.chatHistory directly
    const messages = [...(piState.chatHistory || []), { role: 'user', content: inputMessage }];

    // Bug 1 fix: guarantee provider initialization before the first executeTurn (PI_NOT_INITIALIZED).
    await this.ensureInitialized();

    // FIX A: thread the resolved provider/model identity down to the executor.
    const executionResult = await this.executor.executeTurn({
      ticketKey: piState.ticketKey,
      sessionId: piState.piSessionId,
      agentId,
      messages,
      provider: this.resolvedProviderId,
      model: this.resolvedModelId,
    });

    const approvedToolCalls: NormalizedToolCall[] = [];
    if (executionResult.toolCalls && executionResult.toolCalls.length > 0) {
      for (const toolCall of executionResult.toolCalls) {
        // 1. Tool approval check fix: enforce checking approved flag
        const approval = await this.approvalAdapter.processToolApproval(toolCall, {
          agentId,
          ticketKey: piState.ticketKey
        });

        if (approval.approved) {
          approvedToolCalls.push(approval.normalizedToolCall);
        } else {
          executionResult.error = executionResult.error || {
            code: 'TOOL_APPROVAL_REJECTED',
            message: `Tool call '${toolCall.name}' was rejected: ${approval.reason || 'User rejected'}`
          };
        }
      }
    }
    executionResult.toolCalls = approvedToolCalls;

    // 3. Error tracking fix: record turn errors in state.errors and mark pipelineStatus = 'ERROR'
    const errors = [...(piState.errors || [])];
    let pipelineStatus = piState.pipelineStatus;

    if (executionResult.error) {
      errors.push(executionResult.error);
      pipelineStatus = 'ERROR';
    }

    const updatedState: PiInternalState = {
      ...piState,
      chatHistory: executionResult.messages,
      currentAgentId: agentId,
      toolCallCount: piState.toolCallCount + approvedToolCalls.length,
      errors,
      pipelineStatus
    };

    if (piState.threadId) {
      await this.checkpointer.savePiState(piState.threadId, updatedState);
    }

    return { result: executionResult, nextState: updatedState };
  }

  async transitionPhase(
    currentState: PipelineState,
    intent: Intent
  ): Promise<{ nextPhase: string; nextState: PiInternalState }> {
    const piState = this.stateAdapter.toPiState(currentState);
    const routingResult = await this.router.routePhase(piState, intent);
    const nextState = this.stateAdapter.toPiState(routingResult.updatedState as PipelineState);

    if (nextState.threadId) {
      await this.checkpointer.savePiState(nextState.threadId, nextState);
    }

    return { nextPhase: routingResult.nextPhase, nextState };
  }

  /**
   * Public accessor to load persisted state from checkpointer.
   */
  async loadPersistedState(threadId: string): Promise<PiInternalState | null> {
    return this.checkpointer.loadPiState(threadId);
  }
}
