import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentEvent, BeforeToolCallContext, BeforeToolCallResult } from '@earendil-works/pi-agent-core';
import type { SystemMessage } from '@earendil-works/pi-ai';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import type { MutableModels, CredentialStore } from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { createGatewayProvider } from './pi-gateway-provider.js';
import type { PiProviderConfig } from './pi-provider-config.js';
import { mapAgentEvent, extractToolResultText, type EventCollector } from './pi-event-mapper.js';
import { isRetryableLlmError } from './utils/classify-llm-error.js';
import { TurnBudgetGuard, buildStopNote, buildSteerCorrection, buildFailureSteerCorrection, buildTextSteerCorrection, splitCompletedBlocks } from './turn-budget-guard.js';
import { ToolEventTracker } from './pi-event-mapper.js';
import { debugLog, debugError } from '../debug-logger.js';
import type { ToolApprovalGateHandler } from './approval-adapter.js';

export * from './pi-provider-types.js';
import type {
  ToolCall,
  ToolResult,
  PiInput,
  PiRunInput,
  PiRunResult,
  PiStreamChunk,
  PiAgent,
  CredentialResolver,
  IPiProvider,
} from './pi-provider-types.js';

function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
}

export class PiProvider {
  readonly providerName = 'PiProvider' as const;
  private initialized = false;
  private config?: PiProviderConfig;
  private models?: MutableModels;
  private agent?: Agent;
  private credentialResolver?: CredentialResolver;
  private credentialStore?: CredentialStore;
  private toolApproval?: ToolApprovalGateHandler;
  private modelId?: string;
  private providerId?: string;
  /** PI-MODEL-FALLBACK: ordered fallback model ids tried when a run fails transiently. */
  private fallbackModelIds: string[] = [];
  /** CONCURRENCY-FIX: serializes run() so agent.prompt() never overlaps activeRun. */
  private running?: Promise<PiRunResult>;

  /** SEC-289-01: expose SDK availability so callers can distinguish real vs stub mode. */
  get sdkAvailable(): boolean {
    return this.agent != null;
  }

  /** Bridge credentials (SecretStorage-backed) into the Agent's getApiKey. */
  setCredentialResolver(resolver: CredentialResolver): void {
    this.credentialResolver = resolver;
  }

  /** FIX J (§5d): pre-execution approval gate — set by the engine from the gate handler. */
  setToolApproval(handler?: ToolApprovalGateHandler): void {
    this.toolApproval = handler;
  }

  /**
   * SDK `beforeToolCall` hook: runs AFTER tool_execution_start but BEFORE the
   * tool body executes, so a rejection truly prevents execution (the old
   * post-hoc ApprovalAdapter loop ran after the whole agent turn — bash had
   * already executed, then the turn hung on an approval nobody could give).
   * Fails CLOSED: an approval-system error blocks instead of running unguarded.
   */
  private async gateBeforeToolCall(context: BeforeToolCallContext): Promise<BeforeToolCallResult | undefined> {
    if (!this.toolApproval) return undefined;
    try {
      const res = await this.toolApproval.requestApproval({
        toolUseId: context.toolCall.id,
        toolName: context.toolCall.name,
        input: (context.args ?? {}) as Record<string, unknown>,
      });
      return res.approved ? undefined : { block: true, reason: res.reason || 'Tool approval required' };
    } catch (err) {
      debugError('[PiProvider] tool approval check failed — blocking tool call', err as Error);
      return { block: true, reason: `Approval check failed: ${(err as Error).message}` };
    }
  }

  /** FIX 2: seed the pi-ai credentials store so streamSimple's auth path resolves the key. */
  async seedCredentials(providerId: string, key: string): Promise<void> {
    if (!this.credentialStore || !key) return;
    try {
      await this.credentialStore.modify(providerId, (() => ({ type: 'api_key', key })) as never);
      debugLog(`[PiProvider] Credentials seeded for '${providerId}' into pi-ai auth store.`);
    } catch (err: unknown) {
      debugError(`[PiProvider] Failed to seed credentials for '${providerId}'`, err as Error);
    }
  }

  /** FIX 4: register/re-register an OpenAI-compatible gateway provider with a custom baseUrl. */
  async registerGateway(providerId: string, baseUrl: string, apiKey?: string): Promise<void> {
    if (!this.models || !baseUrl) return;
    try {
      const gateway = await createGatewayProvider(providerId, baseUrl, apiKey);
      this.models.setProvider(gateway);
      debugLog(`[PiProvider] Gateway provider '${providerId}' registered with baseUrl '${baseUrl}'.`);
    } catch (err: unknown) {
      debugError(`[PiProvider] Failed to register gateway '${providerId}'`, err as Error);
    }
  }

  async setModel(providerId: string, modelId: string): Promise<boolean> {
    if (!this.models) return false;
    const model = this.models.getModel(providerId, modelId);
    if (!model) {
      debugLog(`[PiProvider] Model '${modelId}' not found for provider '${providerId}'.`);
      return false;
    }
    this.providerId = providerId;
    this.modelId = modelId;
    if (this.agent) { this.agent.state.model = model; }
    return true;
  }

  /** FIX B1/3: resolve a default model id by querying the pi-ai registry (provider-aware preference). */
  resolveDefaultModel(providerId: string): string | undefined {
    if (!this.models) return undefined;
    try {
      const models = this.models.getModels(providerId);
      if (!models || models.length === 0) return undefined;
      // Provider-aware preference: anthropic → sonnet/opus; openai → gpt-4o/gpt-4.1; else first.
      const preference = providerId === 'openai' ? /gpt-4o|gpt-4\.1|gpt-5/i : /sonnet|opus/i;
      const preferred = models.find((m: { id: string }) => preference.test(m.id));
      return (preferred ?? models[0]).id;
    } catch (err: unknown) {
      debugError(`[PiProvider] resolveDefaultModel failed for '${providerId}'`, err as Error);
      return undefined;
    }
  }

  /**
   * PI-MODEL-FALLBACK: set the ordered list of model ids to try (in order) when a
   * run fails with a transient/gateway error. Only ids that exist in the registry
   * for `providerId` are kept; unknown ids are dropped (they'd just error again).
   * @param providerId provider whose registry validates the ids
   * @param modelIds ordered candidate model ids (first = primary, rest = fallbacks)
   */
  setFallbackModels(providerId: string, modelIds: string[]): void {
    if (!this.models) { this.fallbackModelIds = []; return; }
    const seen = new Set<string>();
    const valid: string[] = [];
    for (const id of modelIds) {
      const trimmed = id?.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      if (this.models.getModel(providerId, trimmed)) { valid.push(trimmed); }
      else { debugLog(`[PiProvider] Fallback model '${trimmed}' not in registry — skipped.`); }
    }
    this.fallbackModelIds = valid;
    debugLog(`[PiProvider] Fallback chain (${valid.length}): ${valid.join(' → ') || '(none)'}`);
  }

  /**
   * PI-MODEL-FALLBACK: build the ordered candidate chain for a run.
   * Primary model (the one currently on the agent, or the run's requested model)
   * goes first, followed by the configured fallbacks (deduped, primary removed).
   */
  private buildRunChain(primaryProviderId?: string, primaryModelId?: string): string[] {
    const chain: string[] = [];
    const push = (id?: string) => {
      const t = id?.trim();
      if (t && !chain.includes(t)) chain.push(t);
    };
    push(primaryModelId ?? this.modelId);
    // Only append fallbacks that belong to the same provider registry as the primary.
    const providerId = primaryProviderId ?? this.providerId;
    if (providerId && this.models) {
      for (const id of this.fallbackModelIds) {
        if (this.models.getModel(providerId, id)) push(id);
      }
    }
    return chain;
  }

  async initialize(config: PiProviderConfig): Promise<void> {
    if (!config || !config.transportType || !['WebSocket', 'HTTP'].includes(config.transportType)) {
      throw new Error('PI_CONFIG_INVALID: Invalid transport type');
    }
    if (this.initialized && this.agent) return;

    // SEC-289-01/06: allowStub is only respected in test environments, never in production
    const safeConfig: PiProviderConfig = { ...config };
    if (safeConfig.allowStub && !isTestMode()) {
      delete safeConfig.allowStub;
    }
    this.config = safeConfig;

    try {
      // FIX 1: builtinModels() registers all built-in providers (createModels() alone returns
      // an EMPTY registry). If a test injected a registry, keep it untouched (faux injection).
      this.credentialStore = new InMemoryCredentialStore();
      this.models = config.models ?? builtinModels({ credentials: this.credentialStore });

      // FIX 4: custom OpenAI-compatible gateway — register a provider carrying the baseUrl
      // (models must be remapped too; provider baseUrl alone is overridden by model baseUrl).
      if (config.baseUrl && !config.models) {
        const gateway = await createGatewayProvider('openai', config.baseUrl);
        this.models.setProvider(gateway);
        debugLog(`[PiProvider] Gateway provider registered with baseUrl '${config.baseUrl}'.`);
      }

      // FIX 1: assert the registry is non-empty (empty registry = silent Unknown-provider failure)
      const registeredCount = this.models.getModels().length;
      debugLog(`[PiProvider] Models registry initialized: ${registeredCount} models registered.`);
      if (registeredCount === 0) {
        throw new Error('PI_SDK_UNAVAILABLE: Models registry is empty — no provider registered.');
      }

      this.agent = new Agent({
        streamFn: (model, context, options) => this.models!.streamSimple(model, context, options),
        getApiKey: this.credentialResolver,
        sessionId: config.sessionId,
        // Fix J: gates every tool BEFORE execution (reads this.toolApproval live,
        // so setToolApproval may be called before or after initialize).
        beforeToolCall: (context) => this.gateBeforeToolCall(context),
      });
    } catch (err) {
      debugError('[PiProvider] Failed to initialize pi-agent-core Agent', err as Error);
      this.agent = undefined;
      throw err instanceof Error && err.message.startsWith('PI_')
        ? err
        : new Error(`PI_SDK_UNAVAILABLE: pi-agent-core Agent could not be created (${(err as Error).message})`);
    }

    this.initialized = true;
  }

  /**
   * Run a prompt through the real Agent and collect streamed output.
   * Streaming arrives via Agent.subscribe events (message_update / tool_execution_*), not a generator.
   *
   * CONCURRENCY-FIX: the Agent has a single activeRun; calling prompt() while one is active throws
   * "Agent is already processing a prompt". We serialize here: a new run() chains after the previous
   * in-flight one instead of overlapping the SDK Agent.
   */
  async run(input: PiRunInput): Promise<PiRunResult> {
    if (!this.initialized || !this.agent) {
      throw new Error('PI_NOT_INITIALIZED: Provider must be initialized first');
    }
    // Serialize: never call agent.prompt() while a previous run is active.
    const prev = this.running ?? Promise.resolve();
    const exec = prev.catch(() => {}).then(() => this.runOnce(input));
    this.running = exec.finally(() => {
      if (this.running === exec) this.running = undefined;
    });
    return this.running;
  }

  /**
   * The turn on the Agent. Only ever invoked sequentially via run().
   *
   * PI-MODEL-FALLBACK: try each model in the resolved chain in order. When a model
   * fails with a TRANSIENT gateway/upstream error (5xx, timeout, bridge sandbox…),
   * move on to the next model with the SAME prompt. Stop on first success, on a
   * non-retryable error (4xx/auth/bad-request), or when the chain is exhausted.
   */
  private async runOnce(input: PiRunInput): Promise<PiRunResult> {
    const agent = this.agent!;
    if (input.tools) { agent.state.tools = input.tools; }
    if (input.systemPrompt) { applySystemPrompt(agent, input.systemPrompt); }
    const providerId = input.provider ?? this.providerId;
    const chain = this.buildRunChain(input.provider, input.model);
    // No chain (no configured model at all) → single attempt on the agent's current model.
    const attempts = chain.length > 0 ? chain : [this.modelId ?? ''];

    let lastResult: PiRunResult | undefined;
    for (let i = 0; i < attempts.length; i++) {
      const modelId = attempts[i];
      this.selectModelForAttempt(agent, providerId, modelId);

      const result = await this.promptOnCurrentModel(agent, input.prompt, input.turnBudget, input.onToolEvent);
      if (!result.errorMessage) {
        if (i > 0) { debugLog(`[PiProvider] Recovered on fallback model '${modelId}' (attempt ${i + 1}/${attempts.length}).`); }
        return result;
      }

      lastResult = result;
      const isLast = i === attempts.length - 1;
      if (isLast || !isRetryableLlmError(result.errorMessage)) {
        if (!isLast) { debugLog(`[PiProvider] Non-retryable error on '${modelId}' — not falling back: ${result.errorMessage}`); }
        break;
      }
      debugLog(`[PiProvider] Model '${modelId}' failed transiently (${result.errorMessage}) — trying next fallback.`);
    }
    return lastResult ?? { text: '', toolCalls: [], chunks: [{ type: 'done' }], messages: agent.state.messages.slice() };
  }

  /** PI-MODEL-FALLBACK: point the agent at a specific model id before an attempt. */
  private selectModelForAttempt(agent: Agent, providerId: string | undefined, modelId: string): void {
    if (!modelId || !providerId || !this.models) return;
    const model = this.models.getModel(providerId, modelId);
    if (model) { agent.state.model = model; }
    else { debugLog(`[PiProvider] Model '${modelId}' not found for '${providerId}' — using current default.`); }
  }

  /**
   * Run a single prompt on whatever model the agent is currently set to.
   * Captures both thrown errors and Agent.state.errorMessage into errorMessage so
   * the caller can decide whether to fall back.
   *
   * Loop guard: a TurnBudgetGuard counts tool calls (total + per-signature
   * repeats) and arms a wall-clock timeout. On trip it aborts the agent run;
   * partial output is kept with an explanatory note instead of an error so
   * the user sees results instead of a hang (UAT runaway-find loop).
   */
  private async promptOnCurrentModel(
    agent: Agent,
    prompt: string,
    budget?: import('./turn-budget-guard.js').TurnBudget,
    onToolEvent?: import('./pi-provider-types.js').PiRunInput['onToolEvent']
  ): Promise<PiRunResult> {
    const collector: EventCollector = { chunks: [], toolCalls: [], text: '' };
    // Shared steer/abort effectors (never throw — event dispatch must survive).
    const abortRun = (): void => {
      try {
        agent.abort();
      } catch {
        // Abort must never break event dispatch.
      }
    };
    const steerWith = (text: string): void => {
      try {
        agent.steer({
          role: 'user',
          content: [{ type: 'text', text }],
          timestamp: Date.now(),
        } as never);
      } catch {
        // Steering must never break event dispatch.
      }
    };
    const guard = new TurnBudgetGuard(TurnBudgetGuard.resolveDefaults(budget), abortRun);
    const tracker = new ToolEventTracker();
    // Text perseveration watch: feed newly COMPLETED assistant blocks
    // (paragraphs/fences) to the same repeat guard (spec: response repeats).
    let seenBlocks = 0;
    const repeatLimit = TurnBudgetGuard.resolveDefaults(budget).maxSameToolRepeats;
    const watchTextRepeats = () => {
      const blocks = splitCompletedBlocks(collector.text);
      for (let i = seenBlocks; i < blocks.length; i++) {
        const action = guard.observeTextBlock(blocks[i]);
        if (action === 'steer') steerWith(buildTextSteerCorrection(repeatLimit));
        else if (action === 'abort') abortRun();
      }
      seenBlocks = blocks.length;
    };
    const unsubscribe = agent.subscribe((event: AgentEvent) => {
      if ((event as { type?: string }).type === 'tool_execution_start') {
        const e = event as { toolName?: string; args?: unknown };
        let argsJson = '';
        try {
          argsJson = JSON.stringify(e.args ?? '');
        } catch {
          argsJson = String(e.args ?? '').slice(0, 300);
        }
        const toolName = String(e.toolName ?? '?');
        const action = guard.observeToolCall(toolName, argsJson);
        // First repeat: correct course mid-loop, keep the turn alive;
        // persisted after correction: stop the turn (guard already tripped).
        if (action === 'steer') steerWith(buildSteerCorrection(toolName, guard.stats.totalCalls));
        else if (action === 'abort') abortRun();
      }
      // BUG I: repeated identical FAILURES trip the guard even when the
      // arguments vary (signature = tool + first error line), so a model
      // retrying a malformed command steers/aborts instead of burning the
      // full turn timeout.
      if (event.type === 'tool_execution_end' && event.isError) {
        const toolName = String(event.toolName ?? '?');
        const action = guard.observeToolFailure(toolName, extractToolResultText(event.result));
        if (action === 'steer') steerWith(buildFailureSteerCorrection(toolName, repeatLimit));
        else if (action === 'abort') abortRun();
      }
      const live = tracker.observe(event);
      if (live && onToolEvent) {
        try {
          onToolEvent(live);
        } catch {
          // Progress display must never break the turn.
        }
      }
      mapAgentEvent(event, collector);
      watchTextRepeats();
    });
    guard.startTimeout();
    try {
      // Stuck-run recovery: if the SDK somehow still has an active run (previous turn crashed
      // mid-flight, abort raced), settle it BEFORE prompting — never prompt over activeRun.
      if (agent.state.isStreaming) {
        debugLog('[PiProvider] Stuck active run detected — waiting for idle before new prompt.');
        await agent.waitForIdle();
      }
      await agent.prompt(prompt);
      await agent.waitForIdle();
      return this.collectResult(agent, collector, guard);
    } catch (err: unknown) {
      // Our own guard abort: partial results + note, NOT an error (turn completes).
      if (guard.stoppedReason) {
        // waitForIdle may still reject after abort — settle quietly.
        try {
          await agent.waitForIdle();
        } catch {
          // Ignore settle errors after a guarded abort.
        }
        return this.collectResult(agent, collector, guard);
      }
      debugError('[PiProvider] run failed', err as Error);
      if (agent.state.isStreaming) {
        debugLog('[PiProvider] run failed while agent still streaming — re-settling idle.');
        try { await agent.waitForIdle(); } catch { /* ignore settle errors */ }
      }
      return { ...this.collectResult(agent, collector), errorMessage: (err as Error).message };
    } finally {
      guard.clear();
      unsubscribe();
    }
  }

  /** FIX E: snapshot the agent transcript + finalize chunks and error status. */
  private collectResult(agent: Agent, collector: EventCollector, guard?: TurnBudgetGuard): PiRunResult {
    const errorMessage = collector.errorMessage || agent.state.errorMessage;
    let text = collector.text;
    if (guard?.stoppedReason) {
      const note = buildStopNote(guard.stoppedReason, guard.stats.totalCalls);
      text += note;
      // Stream the note too (the adapter renders chunks, not text).
      collector.chunks.push({ type: 'text', content: note });
      debugLog(`[PiProvider] turn stopped early (${guard.stoppedReason}, ${guard.stats.totalCalls} tool calls)`);
    }
    if (!collector.chunks.some(c => c.type === 'done')) {
      collector.chunks.push({ type: 'done' });
    }
    return {
      text,
      toolCalls: collector.toolCalls,
      chunks: collector.chunks,
      messages: agent.state.messages.slice(),
      errorMessage,
    };
  }

  async createAgent(agentId: string, tools?: unknown[]): Promise<PiAgent> {
    if (!this.initialized || !this.agent) {
      throw new Error('PI_NOT_INITIALIZED: Provider must be initialized first');
    }
    if (!agentId || agentId.trim() === '') {
      throw new Error('PI_AGENT_CREATE_FAILED: agentId is required');
    }
    return { agentId, tools, sdkInstance: this.agent };
  }

  /** Compat: stream as AsyncIterable over the Agent's run events. */
  async *stream(input: PiInput): AsyncIterable<PiStreamChunk> {
    const result = await this.run(input);
    for (const chunk of result.chunks) {
      yield chunk;
    }
  }

  async handleToolUse(toolCall: ToolCall): Promise<ToolResult> {
    if (!this.initialized || !this.agent) {
      throw new Error('PI_NOT_INITIALIZED: Provider must be initialized first');
    }
    // Tool execution is owned by the Agent loop (tool_execution_* events in run()).
    debugLog(`[PiProvider] handleToolUse delegated to Agent loop: ${toolCall.name}`);
    return { toolCallId: toolCall.id, result: { delegated: true, tool: toolCall.name } };
  }

  /** Abort the current run if active. */
  abort(): void {
    this.agent?.abort();
  }

  dispose(): void {
    this.agent?.abort();
    this.agent = undefined;
    this.models = undefined;
    this.initialized = false;
  }
}

/**
 * SA4E-336: apply a per-run system prompt under pi-agent-core 0.99.1.
 *
 * In 0.99.1 `agent.state.systemPrompt` is READ-ONLY ("to change the prompt,
 * append a system message with content or sections"). We therefore append a
 * `SystemMessage` to the transcript instead of assigning the field directly.
 * Idempotent: skip when the live prompt already equals the desired text so the
 * same prompt is not re-appended on every turn (the transcript persists across
 * runs). This preserves the pre-upgrade "set the prompt for this run" intent.
 * @param agent Active pi-agent-core Agent
 * @param prompt Desired workspace system prompt for this run
 */
function applySystemPrompt(agent: Agent, prompt: string): void {
  if (agent.state.systemPrompt === prompt) return;
  const systemMessage: SystemMessage = {
    role: 'system',
    content: prompt,
    timestamp: Date.now(),
  };
  agent.state.messages = [...agent.state.messages, systemMessage];
}
