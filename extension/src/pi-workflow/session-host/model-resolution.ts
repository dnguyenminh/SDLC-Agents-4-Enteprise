/**
 * ModelRuntime bootstrap + model resolution for the PiAgentSessionHost
 * (SA4E-334 Option A): runtime API-key seeding, gateway registration, and
 * the configured-model → registry-fallback resolution.
 */
import { debugLog } from '../../debug-logger';
import type { SessionHostOptions } from './types.js';

type PiCoding = typeof import('@earendil-works/pi-coding-agent');
type ModelRuntime = Awaited<ReturnType<PiCoding['ModelRuntime']['create']>>;

/**
 * Creates the ModelRuntime, seeds real keys / gateway registrations, and
 * resolves the model (configured id → provider-aware registry fallback).
 * NOTE: session-first serves cloud (key-requiring) providers only.
 * Local endpoints go through the legacy gateway path (see trySessionTurn),
 * so only real keys are seeded here — never dummies.
 */
export async function createModelRuntime(
  piCoding: PiCoding,
  opts: SessionHostOptions
): Promise<{ modelRuntime: ModelRuntime; model: unknown }> {
  const providerId = opts.providerId;
  const modelRuntime = await piCoding.ModelRuntime.create();
  seedModelRuntime(modelRuntime, opts);
  const model = resolveModelForProvider(modelRuntime, providerId, (opts.configuredModelId ?? '').trim());
  if (!model) {
    throw new Error(
      `PI_MODEL_UNRESOLVED: no model for provider '${providerId}' (session path; legacy fallback applies)`
    );
  }
  return { modelRuntime, model };
}

/** Seeds the runtime API key and registers the OpenAI-compatible gateway baseUrl (FIX 4). */
async function seedModelRuntime(modelRuntime: ModelRuntime, opts: SessionHostOptions): Promise<void> {
  const providerId = opts.providerId;
  if (opts.apiKey) {
    await modelRuntime.setRuntimeApiKey(providerId, opts.apiKey);
  }
  await registerGateway(modelRuntime, opts);
}

/** FIX 4: register/re-register a gateway provider carrying the custom baseUrl (never throws — skipped on failure). */
async function registerGateway(modelRuntime: ModelRuntime, opts: SessionHostOptions): Promise<void> {
  if (!opts.baseUrl) return;
  try {
    modelRuntime.registerProvider(opts.providerId, { baseUrl: opts.baseUrl } as never);
    debugLog(`[PiSessionHost] gateway registered for '${opts.providerId}'`);
  } catch (err) {
    debugLog(`[PiSessionHost] gateway register skipped: ${(err as Error).message}`);
  }
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
