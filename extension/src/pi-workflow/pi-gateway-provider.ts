import { createProvider, envApiKeyAuth } from '@earendil-works/pi-ai';
import type { Provider } from '@earendil-works/pi-ai';
import { fetchGatewayModels } from '../chat-panel/chat-models.js';
import { debugLog } from '../debug-logger.js';

/** A pi-ai Model built from a real gateway model entry. */
interface GatewayModel {
  id: string;
  name: string;
  api: string;
  provider: string;
  baseUrl: string;
  reasoning: boolean;
  input: string[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

/**
 * Map gateway model entries → pi-ai Model shape (SA4E-289 PI-GATEWAY-MODEL-FIX).
 * Keeps `provider: providerId` so auth lookup matches the seeded credential.
 */
function buildGatewayModels(
  entries: Array<{ id: string; name?: string }>,
  providerId: string,
  baseUrl: string,
  api: string
): GatewayModel[] {
  return entries.map((m) => ({
    id: m.id,
    name: m.name || m.id,
    api,
    provider: providerId,
    baseUrl,
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  }));
}

/**
 * FIX 1+4+B: build a gateway provider whose models come from the gateway's REAL
 * `/v1/models` list (fetched WITH the API key — the gateway 401s without it).
 * The static pi-ai catalog is ONLY a fallback when the gateway list is unavailable.
 */
export async function createGatewayProvider(
  providerId: string,
  baseUrl: string,
  apiKey?: string
): Promise<Provider> {
  const authHeader = apiKey ? `Bearer ${apiKey}` : undefined;
  const realModels = await fetchGatewayModels(baseUrl, authHeader);

  if (providerId === 'anthropic') {
    const { anthropicMessagesApi } = await import('@earendil-works/pi-ai/api/anthropic-messages.lazy');
    let models;
    if (realModels && realModels.length > 0) {
      models = buildGatewayModels(realModels, providerId, baseUrl, 'anthropic-messages') as never;
      debugLog(`[GatewayProvider] Using ${realModels.length} REAL models from gateway (${baseUrl}).`);
    } else {
      const { ANTHROPIC_MODELS } = await import('@earendil-works/pi-ai/providers/anthropic.models');
      models = Object.values(ANTHROPIC_MODELS).map((m: Record<string, unknown>) => ({ ...m, baseUrl })) as never;
      debugLog(`[GatewayProvider] Gateway models unavailable — falling back to static ANTHROPIC_MODELS catalog.`);
    }
    return createProvider({
      id: providerId,
      name: `${providerId} (Gateway)`,
      baseUrl,
      auth: { apiKey: envApiKeyAuth('Anthropic API key', ['ANTHROPIC_API_KEY']) },
      models,
      api: anthropicMessagesApi() as never,
    });
  }

  // Default: OpenAI-compatible gateway (openai, lmstudio, openrouter, custom…).
  // ⛔ ROOT-CAUSE FIX (SA4E-289): OmniRoute and every OpenAI-compatible gateway serve the
  // Chat Completions API (/v1/chat/completions), NOT the Responses API (/v1/responses).
  // Binding to openAIResponsesApi() made pi-ai hit /v1/responses, which the gateway does not
  // serve as expected → no text_delta events → empty (silent) response. Use Chat Completions.
  // The model's `api` field MUST match the adapter (model.api overrides provider.api), so set
  // both the buildGatewayModels api tag and the fallback catalog api to 'openai-completions'.
  const { openAICompletionsApi } = await import('@earendil-works/pi-ai/api/openai-completions.lazy');
  let models;
  if (realModels && realModels.length > 0) {
    models = buildGatewayModels(realModels, providerId, baseUrl, 'openai-completions') as never;
    debugLog(`[GatewayProvider] Using ${realModels.length} REAL models from gateway (${baseUrl}).`);
  } else {
    const { OPENAI_MODELS } = await import('@earendil-works/pi-ai/providers/openai.models');
    models = Object.values(OPENAI_MODELS).map((m: Record<string, unknown>) => ({ ...m, baseUrl, api: 'openai-completions' })) as never;
    debugLog(`[GatewayProvider] Gateway models unavailable — falling back to static OPENAI_MODELS catalog.`);
  }
  return createProvider({
    id: providerId,
    name: `${providerId} (Gateway)`,
    baseUrl,
    auth: { apiKey: envApiKeyAuth(`${providerId} API key`, ['OPENAI_API_KEY']) },
    models,
    api: openAICompletionsApi() as never,
  });
}
