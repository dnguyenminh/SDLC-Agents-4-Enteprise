/**
 * PiProviderBase — provider state + configuration/credential/model management
 * (SEC-289-01) and the budget-gated intra-turn streamFn (SA4E-355 UAT bug 2).
 * Turn execution lives in ./run-lifecycle.ts, compat API in ./compat-api.ts.
 */
import { Agent } from '@earendil-works/pi-agent-core';
import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { MutableModels, CredentialStore } from '@earendil-works/pi-ai';
import { createGatewayProvider } from '../pi-gateway-provider.js';
import type { PiProviderConfig } from '../pi-provider-config.js';
import { governIntraTurnRequest } from '../intra-turn-budget-gate.js';
import { debugLog, debugError } from '../../debug-logger.js';
import type { ToolApprovalGateHandler } from '../approval-adapter.js';
import type { CredentialResolver, PiRunResult } from '../pi-provider-types.js';

export class PiProviderBase {
  readonly providerName = 'PiProvider' as const;
  protected initialized = false;
  protected config?: PiProviderConfig;
  protected models?: MutableModels;
  protected agent?: Agent;
  protected credentialResolver?: CredentialResolver;
  protected credentialStore?: CredentialStore;
  protected toolApproval?: ToolApprovalGateHandler;
  protected modelId?: string;
  protected providerId?: string;
  /** SA4E-355 UAT bug 2: probe-detected meta.n_ctx — first link of the BR-01 chain for the intra-turn gate. */
  protected detectedContextWindow?: number;
  /** SA4E-355 UAT bug 2: model id of the CURRENT attempt (intra-turn gate budget label). */
  protected activeModelId?: string;
  /** PI-MODEL-FALLBACK: ordered fallback model ids tried when a run fails transiently. */
  protected fallbackModelIds: string[] = [];
  /** CONCURRENCY-FIX: serializes run() so agent.prompt() never overlaps activeRun. */
  protected running?: Promise<PiRunResult>;

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
    this.activeModelId = modelId;
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
   * SA4E-355 UAT fix #3: context window of the CURRENTLY resolved model from
   * the runtime (pi-ai) model registry — the registry link of the BR-01 chain
   * (probe meta.n_ctx → runtime registry → default). Gateway-registered models
   * carry the real context_length / meta.n_ctx parsed at registration.
   */
  getModelContextWindow(): number | undefined {
    if (!this.models || !this.providerId || !this.modelId) return undefined;
    try {
      const model = this.models.getModel(this.providerId, this.modelId) as { contextWindow?: number } | undefined;
      const w = model?.contextWindow;
      return typeof w === 'number' && Number.isFinite(w) && w > 0 ? Math.floor(w) : undefined;
    } catch {
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
   * SA4E-355 UAT bug 2: hand the probe-detected context window (meta.n_ctx —
   * the FIRST link of the BR-01 chain) to the provider so the intra-turn
   * streamFn gate resolves the SAME budget as the turn-start governance gate
   * (probe → runtime registry → static registry → default). Pass undefined to
   * clear (fail-open chain re-resolves per request).
   */
  setDetectedContextWindow(nCtx?: number): void {
    this.detectedContextWindow =
      typeof nCtx === 'number' && Number.isFinite(nCtx) && nCtx > 0 ? Math.floor(nCtx) : undefined;
  }

  /**
   * SDK `streamFn` wrapper — SA4E-355 UAT bug 2: the Agent loop calls this for
   * EVERY intra-turn LLM request with the full transcript, so this is the one
   * point where each request is measured against the context budget, compacted
   * when over (trim-oldest-first at tool-unit granularity) or REJECTED with
   * PI_CONTEXT_BUDGET_EXCEEDED (BR-09) — the provider never sees an oversized
   * request. The gate never mutates the Agent's transcript; the delegated
   * context is a new object when compaction changed the messages.
   */
  protected streamWithBudgetGate(...args: Parameters<StreamFn>): ReturnType<StreamFn> {
    const [model, context, options] = args;
    const gated = governIntraTurnRequest({
      messages: context.messages,
      modelId: this.activeModelId ?? this.modelId ?? '',
      nCtxDetected: this.detectedContextWindow ?? this.getModelContextWindow(),
    });
    return this.models!.streamSimple(model, { ...context, messages: gated.messages }, options);
  }
}
