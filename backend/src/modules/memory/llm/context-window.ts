/**
 * ContextWindowDiscovery — resolves the LLM context window for SA4E-338 A1.
 *
 * Priority: env LLM_CONTEXT_WINDOW > session cache > provider metadata > fallback 8192.
 * Never throws — every failure path resolves to windowSource:'fallback' + warn (BR-03).
 *
 * Provider endpoints (5 s timeout, AbortSignal.timeout):
 *  - Ollama: POST {baseUrl}/api/show {model} → model_info.*.context_length (MAX wins)
 *  - LM Studio: GET {baseUrl}/api/v0/models → data[].max_context_length
 *  - vLLM: GET {baseUrl}/v1/models → data[].max_model_len
 */

import type { LLMConfig, LLMProvider } from './types.js';

export type WindowSource = 'env' | 'provider' | 'fallback';
export type LLMProviderId = 'ollama' | 'lmstudio' | 'vllm' | string;

export interface WindowInfo {
  contextWindow: number;
  windowSource: WindowSource;
  provider: LLMProviderId;
  providerFieldUsed?: string;
  reservedOutputTokens: number;
  modelKey: string;
  cachedAt: string;
}

const DISCOVERY_TIMEOUT_MS = 5000;
const FALLBACK_WINDOW = 8192;
const EST_PROMPT_OVERHEAD = 512; // conservative BR-20 validation only

function modelKey(cfg: LLMConfig): string {
  return `${cfg.provider}:${cfg.model}:${cfg.baseUrl}`;
}

/** Strict parse: only number-typed integers > 0 (EF-1.6). Returns null for strings, nulls, floats, ≤0. */
export function parsePositiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) return null;
  return v;
}

/** Parse env-string (always a string) to positive integer or null (EF-1.3). */
export function parseEnvPositiveInt(v: string): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** Max of all arch-suffixed *.context_length keys in model_info (OI-01 resolver). */
export function resolveOllamaContextLength(
  modelInfo: Record<string, unknown> | null | undefined,
): { key: string; value: number } | null {
  if (!modelInfo || typeof modelInfo !== 'object') return null;
  const entries: Array<{ key: string; value: number }> = [];
  for (const [k, v] of Object.entries(modelInfo)) {
    if (typeof k !== 'string' || !k.endsWith('.context_length')) continue;
    const val = parsePositiveInt(v);
    if (val !== null) entries.push({ key: k, value: val });
  }
  if (entries.length === 0) return null;
  return entries.reduce((a, b) => (b.value > a.value ? b : a));
}

export class ContextWindowDiscovery {
  private readonly cache = new Map<string, WindowInfo>();

  /** Invalidate one entry (by modelKey) or the whole cache (AF-1.2). */
  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Resolve the context window for the given config.
   * Never throws — every failure path resolves to fallback 8192 + warn (BR-03).
   */
  async getContextWindow(cfg: LLMConfig): Promise<WindowInfo> {
    const reserved = cfg.maxTokens ?? 800;
    const key = modelKey(cfg);
    const now = () => new Date().toISOString();

    // 0) env override — highest priority, cache-independent (BR-04, AF-1.1)
    const rawEnv = process.env.LLM_CONTEXT_WINDOW;
    if (rawEnv !== undefined) {
      const env = parseEnvPositiveInt(rawEnv);
      if (env !== null) {
        return { contextWindow: env, windowSource: 'env', provider: cfg.provider, reservedOutputTokens: reserved, modelKey: key, cachedAt: now() };
      }
      // EF-1.3: invalid env → warn + ignore override
      // eslint-disable-next-line no-console
      console.warn(`ERR-02 LLM_CONTEXT_WINDOW invalid — ignoring override: ${rawEnv}`);
    }

    // 1) session cache — 1 provider call per session (BR-06, AF-1.4)
    const hit = this.cache.get(key);
    if (hit) return hit;

    // 2) provider discovery (BR-19) with 5 s timeout (§5.5)
    try {
      const { field, raw } = await Promise.race([
        this.queryProviderField(cfg),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('discovery timeout')), DISCOVERY_TIMEOUT_MS),
        ),
      ]);
      const value = parsePositiveInt(raw);
      if (value === null) throw new Error(`field ${field} missing or invalid (EF-1.6)`);
      if (value <= reserved + EST_PROMPT_OVERHEAD) {
        throw new Error(`window ${value} fails BR-20 validation (AF-1.3)`);
      }
      const info: WindowInfo = {
        contextWindow: value,
        windowSource: 'provider',
        providerFieldUsed: field,
        provider: cfg.provider,
        reservedOutputTokens: reserved,
        modelKey: key,
        cachedAt: now(),
      };
      this.cache.set(key, info);
      return info;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // EF-1.1/1.2/1.4/1.5 — swallowed by design → fallback
      if (msg.includes('auth') || msg.includes('401') || msg.includes('403')) {
        // eslint-disable-next-line no-console
        console.warn('ERR-12 window discovery auth failed — fallback to 8192');
      } else {
        // eslint-disable-next-line no-console
        console.warn(`ERR-01 context window fallback to ${FALLBACK_WINDOW} (${msg})`);
      }
      if (FALLBACK_WINDOW <= reserved + EST_PROMPT_OVERHEAD) {
        // eslint-disable-next-line no-console
        console.error(`EF-1.7 fallback window ${FALLBACK_WINDOW} ≤ reserved(${reserved}) + overhead(${EST_PROMPT_OVERHEAD}) — every prompt will route to reduction`);
      }
      const info: WindowInfo = {
        contextWindow: FALLBACK_WINDOW,
        windowSource: 'fallback',
        provider: cfg.provider,
        reservedOutputTokens: reserved,
        modelKey: key,
        cachedAt: now(),
      };
      this.cache.set(key, info);
      return info;
    }
  }

  private async queryProviderField(cfg: LLMConfig): Promise<{ field: string; raw: unknown }> {
    const provider = cfg.provider as string;
    switch (provider) {
      case 'ollama': return this.queryOllama(cfg);
      case 'lmstudio': return this.queryLmStudio(cfg);
      case 'vllm': return this.queryVllm(cfg);
      default: return this.queryOllama(cfg);
    }
  }

  /** Ollama: POST {baseUrl}/api/show {model} → retry {name} on 400/404 (OI-01). */
  private async queryOllama(cfg: LLMConfig): Promise<{ field: string; raw: unknown }> {
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const url = `${base}/api/show`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
    try {
      let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.model }),
        signal: controller.signal,
      });
      // Retry with legacy {name} key on 400/404
      if (res.status === 400 || res.status === 404) {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cfg.model }),
          signal: controller.signal,
        });
      }
      if (!res.ok) throw new Error(`Ollama discovery ${res.status}`);
      const data = (await res.json()) as any;
      const resolved = resolveOllamaContextLength(data?.model_info);
      if (!resolved) throw new Error('no context_length field in Ollama model_info');
      return { field: `model_info.${resolved.key}`, raw: resolved.value };
    } finally {
      clearTimeout(tid);
    }
  }

  /** LM Studio: GET {baseUrl}/api/v0/models → data[].max_context_length (field chain). */
  private async queryLmStudio(cfg: LLMConfig): Promise<{ field: string; raw: unknown }> {
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const apiBase = base.endsWith('/v1') ? base.slice(0, -3) : base;
    const url = `${apiBase}/api/v0/models`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) throw new Error(`LM Studio discovery ${res.status}`);
      const data = (await res.json()) as any;
      const models: unknown[] = data?.data ?? [];
      if (!Array.isArray(models) || models.length === 0) throw new Error('LM Studio: empty data[]');
      let selected = (models as any[]).find((m: any) => m.id === cfg.model);
      if (!selected) selected = (models as any[]).find((m: any) => m.state === 'loaded');
      if (!selected) selected = models[0] as any;
      // Field chain: max_context_length → window_context_length → loaded_context_length
      const val = selected?.max_context_length ?? selected?.window_context_length ?? selected?.loaded_context_length;
      const value = parsePositiveInt(val);
      if (value === null) throw new Error('LM Studio: no valid context_length field');
      return { field: 'data[].max_context_length', raw: value };
    } finally {
      clearTimeout(tid);
    }
  }

  /** vLLM: GET {baseUrl}/v1/models → data[].max_model_len. */
  private async queryVllm(cfg: LLMConfig): Promise<{ field: string; raw: unknown }> {
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const url = `${base}/v1/models`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {};
      if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) throw new Error(`vLLM discovery ${res.status}`);
      const data = (await res.json()) as any;
      const models: unknown[] = data?.data ?? [];
      if (!Array.isArray(models) || models.length === 0) throw new Error('vLLM: empty data[]');
      let selected = (models as any[]).find((m: any) => m.id === cfg.model);
      if (!selected) selected = models[0] as any;
      const val = selected?.max_model_len;
      const value = parsePositiveInt(val);
      if (value === null) throw new Error('vLLM: no valid max_model_len');
      return { field: 'data[].max_model_len', raw: value };
    } finally {
      clearTimeout(tid);
    }
  }
}
