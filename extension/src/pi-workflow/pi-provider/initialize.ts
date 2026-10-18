/**
 * PiProvider SDK bootstrap (SEC-289-01/06, FIX 1/4): credential store,
 * pi-ai models registry (built-in providers + optional OpenAI-compatible
 * gateway), and the pi-agent-core Agent wiring (budget-gated streamFn +
 * pre-execution tool approval).
 */
import { Agent } from '@earendil-works/pi-agent-core';
import type { BeforeToolCallContext, BeforeToolCallResult, StreamFn } from '@earendil-works/pi-agent-core';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import type { MutableModels, CredentialStore } from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { createGatewayProvider } from '../pi-gateway-provider.js';
import type { PiProviderConfig } from '../pi-provider-config.js';
import type { CredentialResolver } from '../pi-provider-types.js';
import { debugLog } from '../../debug-logger.js';

/** Callbacks the provider class keeps live on `this` — wired into the Agent at creation. */
export interface PiProviderSdkHooks {
  streamFn: StreamFn;
  getApiKey?: CredentialResolver;
  beforeToolCall: (context: BeforeToolCallContext) => Promise<BeforeToolCallResult | undefined>;
}

/** Initialized SDK pieces stored on the provider. */
export interface InitializedPiSdk {
  credentialStore: CredentialStore;
  models: MutableModels;
  agent: Agent;
}

/** FIX 1/4: build the models registry + Agent. Throws PI_SDK_UNAVAILABLE on an empty registry. */
export async function initializeSdk(config: PiProviderConfig, hooks: PiProviderSdkHooks): Promise<InitializedPiSdk> {
  // FIX 1: builtinModels() registers all built-in providers (createModels() alone returns
  // an EMPTY registry). If a test injected a registry, keep it untouched (faux injection).
  const credentialStore = new InMemoryCredentialStore();
  const models = config.models ?? builtinModels({ credentials: credentialStore });

  // FIX 4: custom OpenAI-compatible gateway — register a provider carrying the baseUrl
  // (models must be remapped too; provider baseUrl alone is overridden by model baseUrl).
  if (config.baseUrl && !config.models) {
    const gateway = await createGatewayProvider('openai', config.baseUrl);
    models.setProvider(gateway);
    debugLog(`[PiProvider] Gateway provider registered with baseUrl '${config.baseUrl}'.`);
  }

  // FIX 1: assert the registry is non-empty (empty registry = silent Unknown-provider failure)
  const registeredCount = models.getModels().length;
  debugLog(`[PiProvider] Models registry initialized: ${registeredCount} models registered.`);
  if (registeredCount === 0) {
    throw new Error('PI_SDK_UNAVAILABLE: Models registry is empty — no provider registered.');
  }

  const agent = new Agent({
    // SA4E-355 UAT bug 2: every intra-turn LLM request flows through the
    // budget gate (measure → compact → REJECT) before the provider call.
    streamFn: hooks.streamFn,
    getApiKey: hooks.getApiKey,
    sessionId: config.sessionId,
    // Fix J: gates every tool BEFORE execution (reads this.toolApproval live,
    // so setToolApproval may be called before or after initialize).
    beforeToolCall: hooks.beforeToolCall,
  });
  return { credentialStore, models, agent };
}
