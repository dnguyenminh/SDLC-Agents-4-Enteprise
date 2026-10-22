/**
 * ModelRuntime bootstrap + model resolution for the PiAgentSessionHost
 * (SA4E-334 Option A): runtime API-key seeding, gateway registration, and
 * the configured-model → registry-fallback resolution.
 * SA4E-369 UAT root-cause fix: keyless LOCAL providers (lmstudio/ollama/onnx)
 * are now served HERE — the session host registers the proven shared
 * createGatewayProvider builder (real /v1/models + LOCAL_KEYLESS_PLACEHOLDER
 * auth), which is what makes peer_list/peer_send/peer_status and per-tab
 * sessions exist in EVERY tab. The legacy path stays the fail-safe fallback.
 */
import { debugLog } from '../../debug-logger';
import type { SessionHostOptions } from './types.js';
import { providerRequiresApiKey, LOCAL_KEYLESS_PLACEHOLDER } from '../pi-provider-config-bridge.js';
import { createGatewayProvider } from '../pi-gateway-provider.js';
import { fetchGatewayModels } from '../../chat-panel/chat-models.js';

type PiCoding = typeof import('@earendil-works/pi-coding-agent');
type ModelRuntime = Awaited<ReturnType<PiCoding['ModelRuntime']['create']>>;

/**
 * Creates the ModelRuntime, seeds real keys / keyless placeholders / gateway
 * registrations, and resolves the model (configured id → provider-aware registry fallback).
 */
export async function createModelRuntime(
  piCoding: PiCoding,
  opts: SessionHostOptions
): Promise<{ modelRuntime: ModelRuntime; model: unknown }> {
  const providerId = opts.providerId;
  const modelRuntime = await piCoding.ModelRuntime.create();
  await seedModelRuntime(modelRuntime, opts);
  // Keyless local endpoints have NO static catalog: with no gateway baseUrl
  // (or a server listing zero models) the registry is empty here — fail into
  // the legacy path (which appends the local-endpoint checklist hint) instead
  // of silently resolving another provider's model.
  if (!providerRequiresApiKey(providerId) && modelRuntime.getModels(providerId).length === 0) {
    throw new Error(
      `PI_MODEL_UNRESOLVED: no models for keyless provider '${providerId}' ` +
      `(set sdlcAgents.llm.${providerId}.baseUrl to a running OpenAI-compatible endpoint)`
    );
  }
  const model = resolveModelForProvider(modelRuntime, providerId, (opts.configuredModelId ?? '').trim());
  if (!model) {
    throw new Error(
      `PI_MODEL_UNRESOLVED: no model for provider '${providerId}' (session path; legacy fallback applies)`
    );
  }
  return { modelRuntime, model };
}

/**
 * Seeds the runtime API key (real key, or LOCAL_KEYLESS_PLACEHOLDER for
 * keyless local endpoints — LM Studio/Ollama ignore the header value) and
 * registers the gateway (FIX 4).
 */
async function seedModelRuntime(modelRuntime: ModelRuntime, opts: SessionHostOptions): Promise<void> {
  const providerId = opts.providerId;
  const keyless = !providerRequiresApiKey(providerId);
  const key = opts.apiKey ?? (keyless ? LOCAL_KEYLESS_PLACEHOLDER : undefined);
  if (key) {
    await modelRuntime.setRuntimeApiKey(providerId, key);
  }
  await registerGateway(modelRuntime, opts, keyless);
}

/**
 * FIX 4 + SA4E-369 UAT fix: register the gateway provider carrying the custom
 * baseUrl. Keyless local endpoints get the FULL shared gateway provider (real
 * /v1/models models) registered natively — a bare {baseUrl} config has no
 * models for custom provider ids, so model resolution would find nothing.
 * Cloud providers keep the config-level registration (unchanged behavior).
 * Empty/unreachable local gateway → THROW (the legacy fallback owns the rich
 * local-endpoint error hint).
 */
async function registerGateway(modelRuntime: ModelRuntime, opts: SessionHostOptions, keyless: boolean): Promise<void> {
  if (!opts.baseUrl) return;
  if (!keyless) {
    try {
      modelRuntime.registerProvider(opts.providerId, { baseUrl: opts.baseUrl } as never);
      debugLog(`[PiSessionHost] gateway registered for '${opts.providerId}'`);
    } catch (err) {
      debugLog(`[PiSessionHost] gateway register skipped: ${(err as Error).message}`);
    }
    return;
  }
  const authHeader = opts.apiKey ? `Bearer ${opts.apiKey}` : undefined;
  const realModels = await fetchGatewayModels(opts.baseUrl, authHeader);
  if (!realModels || realModels.length === 0) {
    throw new Error(
      `PI_MODEL_UNRESOLVED: gateway '${opts.baseUrl}' listed no models (session path; legacy fallback applies)`
    );
  }
  const gateway = await createGatewayProvider(opts.providerId, opts.baseUrl, opts.apiKey, realModels);
  modelRuntime.registerNativeProvider(gateway as never);
  debugLog(`[PiSessionHost] keyless gateway '${opts.providerId}' registered with ${realModels.length} real models (${opts.baseUrl})`);
}

/**
 * FIX B1/3: model resolution — the raw configured id first, then the
 * provider-aware registry fallback (anthropic → sonnet/opus; openai →
 * gpt-4o/gpt-4.1), else undefined (caller throws PI_MODEL_UNRESOLVED).
 */
function resolveModelForProvider(
  modelRuntime: ModelRuntime,
  providerId: string,
  raw: string
): unknown {
  let model = raw ? modelRuntime.getModel(providerId, raw) : undefined;
  if (model) return model;
  const listed = [...(modelRuntime.getModels(providerId) as unknown as Array<{ id: string }>)];
  const pool = listed.length
    ? listed
    : [...(modelRuntime.getModels() as unknown as Array<{ id: string }>)];
  const fallbackId = pickDefaultModelId(pool, providerId);
  if (fallbackId) {
    model =
      modelRuntime.getModel(providerId, fallbackId) ??
      (modelRuntime.getModels() as unknown as Array<{ id: string }>).find(
        (m) => m.id === fallbackId
      ) as never;
  }
  return model;
}

/** Provider-aware default model id preference (anthropic → sonnet/opus; openai → gpt-4o/gpt-4.1). */
function pickDefaultModelId(
  models: Array<{ id: string }>,
  providerId: string
): string | undefined {
  if (!models.length) return undefined;
  const pref = providerId === 'openai' ? /gpt-4o|gpt-4\.1|gpt-5/i : /sonnet|opus/i;
  return (models.find((m) => pref.test(m.id)) ?? models[0]).id;
}
