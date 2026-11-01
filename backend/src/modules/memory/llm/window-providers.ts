/**
 * Per-provider context-window probing — extracted from context-window.ts
 * (BR-18 SRP split: discovery transport vs cache/policy).
 */

import type { WindowInfo, LLMProviderId } from './context-window.js';

const DISCOVERY_TIMEOUT_MS = 5000;

function makeWindowInfo(
  contextWindow: number,
  provider: LLMProviderId,
  modelKey: string,
  reservedOutputTokens: number,
  providerFieldUsed?: string,
): WindowInfo {
  return {
    contextWindow,
    windowSource: 'provider',
    provider,
    providerFieldUsed,
    reservedOutputTokens,
    modelKey,
    cachedAt: new Date().toISOString(),
  };
}

/** Ollama: /api/show → model_info[*].context_length (max across keys). */
async function discoverOllama(
  model: string, baseUrl: string, modelKey: string, reserved: number, signal: AbortSignal,
): Promise<WindowInfo | null> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/show?model=${encodeURIComponent(model)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as any;
  const modelInfo = data.model_info || {};
  let max = 0;
  let field = '';
  for (const k of Object.keys(modelInfo)) {
    if (k.endsWith('.context_length')) {
      const v = Number(modelInfo[k]);
      if (Number.isInteger(v) && v > max) {
        max = v;
        field = k;
      }
    }
  }
  if (max > 0) {
    return makeWindowInfo(max, 'ollama', modelKey, reserved, `model_info.${field}`);
  }
  return null;
}

/** LM Studio: /api/v0/models → data[] entry context-length fields. */
async function discoverLmStudio(
  model: string, baseUrl: string, modelKey: string, reserved: number, signal: AbortSignal,
): Promise<WindowInfo | null> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v0/models`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as any;
  const entry = Array.isArray(data.data) ? data.data.find((m: any) => m.id === model) : null;
  const v = entry?.max_context_length ?? entry?.window_context_length ?? entry?.loaded_context_length;
  const max = Number(v);
  if (Number.isInteger(max) && max > 0) {
    return makeWindowInfo(max, 'lmstudio', modelKey, reserved, 'data[].max_context_length');
  }
  return null;
}

/** vLLM: /v1/models → data[].max_model_len. */
async function discoverVllm(
  model: string, baseUrl: string, modelKey: string, reserved: number, signal: AbortSignal,
): Promise<WindowInfo | null> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/models`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as any;
  const entry = Array.isArray(data.data) ? data.data.find((m: any) => m.id === model) : null;
  const max = Number(entry?.max_model_len);
  if (Number.isInteger(max) && max > 0) {
    return makeWindowInfo(max, 'vllm', modelKey, reserved, 'data[].max_model_len');
  }
  return null;
}

/**
 * Probe the provider's metadata endpoint for the model's context window.
 * Returns null when the provider exposes nothing usable; throws on transport
 * errors the caller may want to log. The caller owns timeout/abort cleanup.
 */
export async function discoverWindowFromProvider(
  provider: LLMProviderId,
  model: string,
  baseUrl: string,
  reservedOutputTokens: number,
  modelKey: string,
): Promise<WindowInfo | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    if (provider === 'ollama') {
      return await discoverOllama(model, baseUrl, modelKey, reservedOutputTokens, controller.signal);
    }
    if (provider === 'lmstudio') {
      return await discoverLmStudio(model, baseUrl, modelKey, reservedOutputTokens, controller.signal);
    }
    if (provider === 'vllm') {
      return await discoverVllm(model, baseUrl, modelKey, reservedOutputTokens, controller.signal);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
