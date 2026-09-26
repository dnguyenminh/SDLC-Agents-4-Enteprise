import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import type { MutableModels, CredentialStore } from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { createGatewayProvider } from './pi-gateway-provider.js';
import type { PiProviderConfig } from './pi-provider-config.js';
import { mapAgentEvent, type EventCollector } from './pi-event-mapper.js';
import { isRetryableLlmError } from './utils/classify-llm-error.js';
import { debugLog, debugError } from '../debug-logger.js';

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
    if (input.systemPrompt) { agent.state.systemPrompt = input.systemPrompt; }

    const providerId = input.provider ?? this.providerId;
    const chain = this.buildRunChain(input.provider, input.model);
    // No chain (no configured model at all) → single attempt on the agent's current model.
    const attempts = chain.length > 0 ? chain : [this.modelId ?? ''];

    let lastResult: PiRunResult | undefined;
    for (let i = 0; i < attempts.length; i++) {
      const modelId = attempts[i];
      this.selectModelForAttempt(agent, providerId, modelId);

      const result = await this.promptOnCurrentModel(agent, input.prompt);
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
   */
  private async promptOnCurrentModel(agent: Agent, prompt: string): Promise<PiRunResult> {
    const collector: EventCollector = { chunks: [], toolCalls: [], text: '' };
    const unsubscribe = agent.subscribe((event: AgentEvent) => mapAgentEvent(event, collector));
    try {
      // Stuck-run recovery: if the SDK somehow still has an active run (previous turn crashed
      // mid-flight, abort raced), settle it BEFORE prompting — never prompt over activeRun.
      if (agent.state.isStreaming) {
        debugLog('[PiProvider] Stuck active run detected — waiting for idle before new prompt.');
        await agent.waitForIdle();
      }
      await agent.prompt(prompt);
      await agent.waitForIdle();
      return this.collectResult(agent, collector);
    } catch (err: unknown) {
      debugError('[PiProvider] run failed', err as Error);
      if (agent.state.isStreaming) {
        debugLog('[PiProvider] run failed while agent still streaming — re-settling idle.');
        try { await agent.waitForIdle(); } catch { /* ignore settle errors */ }
      }
      return { ...this.collectResult(agent, collector), errorMessage: (err as Error).message };
    } finally {
      unsubscribe();
    }
  }

  /** FIX E: snapshot the agent transcript + finalize chunks and error status. */
  private collectResult(agent: Agent, collector: EventCollector): PiRunResult {
    const errorMessage = collector.errorMessage || agent.state.errorMessage;
    if (!collector.chunks.some(c => c.type === 'done')) {
      collector.chunks.push({ type: 'done' });
    }
    return {
      text: collector.text,
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
