import { PiProvider, type IPiProvider } from './pi-provider.js';
import { PiAgentExecutor } from './pi-agent-executor.js';
import { PhaseRouter, type Intent } from './phase-router.js';
import { StateAdapter } from './state-adapter.js';
import { CheckpointerAdapter } from './checkpointer-adapter.js';
import { createReplaySafeApprovalHandler } from './approval-adapter.js';
import type { PipelineState, PiInternalState } from './types/pi-workflow-state.js';
import type { PiAgentExecutionResult, ExecuteTurnInput } from './types/executor.types.js';
import type { MutableModels } from '@earendil-works/pi-ai';
import { configureProviderOnProvider } from './pi-workflow/provider-config';
import type { ConfigureProviderOptions, ConfigureProviderResult, PiWorkflowConfig } from './pi-workflow/types';

export type { ConfigureProviderOptions, ConfigureProviderResult, PiWorkflowConfig } from './pi-workflow/types';

export class PiWorkflowEngine {
  private provider: IPiProvider;
  private executor: PiAgentExecutor;
  private router: PhaseRouter;
  private stateAdapter: StateAdapter;
  private checkpointer: CheckpointerAdapter;
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
    // Fix J: wire the gate into the provider's PRE-execution beforeToolCall
    // hook (replay-safe: one approval decision per toolUseId). Covers both the
    // injected provider and the default-created one; no-op when no gate given.
    if (config.gateHandler) {
      this.provider.setToolApproval?.(createReplaySafeApprovalHandler(config.gateHandler));
    }
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

    const outcome = await configureProviderOnProvider(p, opts);
    this.resolvedProviderId = outcome.resolvedProviderId;
    this.resolvedModelId = outcome.resolvedModelId;
    return outcome.result;
  }

  async executeTurn(
    currentState: PipelineState,
    inputMessage: string,
    agentId: string,
    turnOpts?: {
      tools?: ExecuteTurnInput['tools'];
      systemPrompt?: string;
      /** SA4E-334 auto-compression: rewrites messages before the LLM call. */
      contextRunner?: (
        messages: Array<{ role: string; content: string }>
      ) => Promise<Array<{ role: string; content: string }>>;
      /** Loop guard: per-turn tool budget + timeout. */
      turnBudget?: ExecuteTurnInput['turnBudget'];
      /** Live tool-activity callback (progress display). */
      onToolEvent?: ExecuteTurnInput['onToolEvent'];
    }
  ): Promise<{ result: PiAgentExecutionResult; nextState: PiInternalState }> {
    const piState = this.stateAdapter.toPiState(currentState);
    // 2. Immutability fix: create new array instead of mutating currentState.chatHistory directly
    let messages = [...(piState.chatHistory || []), { role: 'user', content: inputMessage }];

    // SA4E-334: auto-compression pipeline (billion-context `context` event).
    // Never breaks the turn — falls back to uncompressed messages.
    if (turnOpts?.contextRunner) {
      try {
        const compressed = await turnOpts.contextRunner(messages);
        if (Array.isArray(compressed) && compressed.length > 0) messages = compressed;
      } catch { /* keep original messages */ }
    }

    // Bug 1 fix: guarantee provider initialization before the first executeTurn (PI_NOT_INITIALIZED).
    await this.ensureInitialized();

    // FIX A: thread the resolved provider/model identity down to the executor.
    // SA4E-333: thread workspace tools + systemPrompt (adapter supplies per-turn).
    // Loop guard: thread the per-turn budget the same way.
    const executionResult = await this.executor.executeTurn({
      ticketKey: piState.ticketKey,
      sessionId: piState.piSessionId,
      agentId,
      messages,
      tools: turnOpts?.tools,
      systemPrompt: turnOpts?.systemPrompt,
      turnBudget: turnOpts?.turnBudget,
      onToolEvent: turnOpts?.onToolEvent,
      provider: this.resolvedProviderId,
      model: this.resolvedModelId,
    });

    // Fix J (§5d): approval now happens PRE-execution in the provider's
    // SDK `beforeToolCall` hook (gateHandler → createReplaySafeApprovalHandler
    // → PiProvider.setToolApproval). The old post-turn approval loop here ran
    // AFTER the whole agent turn — tools had already executed, and a pending
    // bash approval hung the turn until the gate timed out (UAT "stops
    // mid-way" blocker). toolCalls pass through untouched below.

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
      toolCallCount: piState.toolCallCount + (executionResult.toolCalls?.length ?? 0),
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
