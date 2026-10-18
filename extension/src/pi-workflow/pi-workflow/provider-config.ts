/**
 * Provider configuration bridging (SA4E-289 FIX A/B/C/2/3/4, PI-MODEL-FALLBACK).
 * Order matters: init → seed credentials → gateway → resolve model.
 */

import { PiProvider } from '../pi-provider.js';
import { providerRequiresApiKey, LOCAL_KEYLESS_PLACEHOLDER } from '../pi-provider-config-bridge.js';
import type { ConfigureProviderOptions, ConfigureProviderResult } from './types';

/**
 * Bridge runtime credentials + model + gateway into the underlying provider,
 * in the correct ORDER (seed → gateway → resolve). Returns the resolved
 * provider/model identity so the engine can thread them to the executor.
 */
export async function configureProviderOnProvider(
  p: PiProvider,
  opts: ConfigureProviderOptions,
): Promise<{ resolvedProviderId?: string; resolvedModelId?: string; result: ConfigureProviderResult }> {
  if (opts.credentialResolver) {
    p.setCredentialResolver(opts.credentialResolver);
  }
  // 2. Resolve the API key ONCE — used for both seeding the credentials store
  //    and fetching the gateway's real model list (auth required).
  // No resolver (no SecretStorage) = nothing to verify — don't block (tests).
  // Local keyless providers (lmstudio/ollama/onnx) never block on missing key.
  let credentialsPresent = true;
  let apiKey: string | undefined;
  if (opts.credentialResolver && opts.providerId) {
    apiKey = await opts.credentialResolver(opts.providerId);
    if (apiKey) {
      await p.seedCredentials(opts.providerId, apiKey);
      credentialsPresent = true;
    } else if (!providerRequiresApiKey(opts.providerId)) {
      // Keyless local endpoint: seed an in-memory dummy so pi-ai auth
      // resolution succeeds ("Provider is not configured" otherwise).
      // LM Studio / Ollama ignore the Authorization header value.
      await p.seedCredentials(opts.providerId, LOCAL_KEYLESS_PLACEHOLDER);
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
    applyFallbackChain(p, opts.providerId, configuredId, opts.fallbackModelIds);
    return {
      resolvedProviderId: opts.providerId,
      resolvedModelId: configuredId,
      result: { resolvedModelId: configuredId, modelUnresolved: false, credentialsPresent },
    };
  }

  // FIX 2b: empty or not-found configured id → resolve a default (prefers gateway registry models).
  let modelId = p.resolveDefaultModel(opts.providerId!) ?? undefined;

  // FIX C: modelUnresolved ONLY for the true case — no model anywhere (gateway + static).
  let modelUnresolved = true;
  if (opts.providerId && modelId) {
    modelUnresolved = !(await p.setModel(opts.providerId, modelId));
  }

  applyFallbackChain(p, opts.providerId, modelId, opts.fallbackModelIds);
  return {
    resolvedProviderId: opts.providerId,
    resolvedModelId: modelId,
    result: { resolvedModelId: modelId, modelUnresolved, credentialsPresent },
  };
}

/**
 * PI-MODEL-FALLBACK: register the ordered fallback chain on the provider.
 * The primary (resolved) model leads; configured fallbacks follow. When the
 * primary is a gateway "auto/*" combo, we still append explicit single-model
 * fallbacks so a totally-dead combo can recover onto a concrete model.
 */
function applyFallbackChain(
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
