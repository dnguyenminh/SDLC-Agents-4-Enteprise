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
// TTL cache: 5 minutes default
const WINDOW_CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, WindowInfo>();

function parsePositiveInt(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export class ContextWindowDiscovery {
  private provider: LLMProviderId;
  private model: string;
  private baseUrl: string;
  private reservedOutputTokens: number;

  constructor(provider: LLMProviderId, model: string, baseUrl: string, reservedOutputTokens = 800) {
    this.provider = provider;
    this.model = model;
    this.baseUrl = baseUrl;
    this.reservedOutputTokens = reservedOutputTokens;
  }

  // Public setters for per-call configuration (SA4E-387)
  setProvider(provider: LLMProviderId): void { this.provider = provider; }
  setModel(model: string): void { this.model = model; }
  setBaseUrl(baseUrl: string): void { this.baseUrl = baseUrl; }
  setReservedOutputTokens(tokens: number): void { this.reservedOutputTokens = tokens; }

  // Public getters
  getProvider(): LLMProviderId { return this.provider; }
  getModel(): string { return this.model; }
  getBaseUrl(): string { return this.baseUrl; }
  getReservedOutputTokens(): number { return this.reservedOutputTokens; }

  private modelKey(): string {
    return `${this.provider}:${this.model}:${this.baseUrl}`;
  }

  async getContextWindow(): Promise<WindowInfo> {
    // 1. Per-model env override: LLM_CONTEXT_WINDOW__<model>
    const envModelKey = `LLM_CONTEXT_WINDOW__${this.model}`;
    const envModelVal = process.env[envModelKey];
    const envModelParsed = parsePositiveInt(envModelVal);
    if (envModelParsed !== null) {
      const info: WindowInfo = {
        contextWindow: envModelParsed,
        windowSource: 'env',
        provider: this.provider,
        reservedOutputTokens: this.reservedOutputTokens,
        modelKey: this.modelKey(),
        cachedAt: new Date().toISOString(),
      };
      cache.set(this.modelKey(), info);
      return info;
    }

    // 2. Fallback to global LLM_CONTEXT_WINDOW (deprecated but supported)
    const envVal = process.env.LLM_CONTEXT_WINDOW;
    const envParsed = parsePositiveInt(envVal);
    if (envParsed !== null) {
      const info: WindowInfo = {
        contextWindow: envParsed,
        windowSource: 'env',
        provider: this.provider,
        reservedOutputTokens: this.reservedOutputTokens,
        modelKey: this.modelKey(),
        cachedAt: new Date().toISOString(),
      };
      cache.set(this.modelKey(), info);
      return info;
    }

    if (envVal && envParsed === null) {
      console.warn('ERR-02 LLM_CONTEXT_WINDOW invalid — ignoring override');
    }

    // 3. Check TTL cache
    const key = this.modelKey();
    const cached = cache.get(key);
    if (cached) {
      const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
      if (cacheAge < WINDOW_CACHE_TTL_MS) {
        return cached;
      }
      // Cache expired, will re-discover
    }

    // 4. Try provider metadata discovery
    try {
      const info = await this.discoverFromProvider();
      if (info) {
        cache.set(key, info);
        return info;
      }
    } catch (e) {
      console.warn('ERR-01 context window fallback to 8192');
    }

    // 5. Fallback
    const fallback: WindowInfo = {
      contextWindow: FALLBACK_WINDOW,
      windowSource: 'fallback',
      provider: this.provider,
      reservedOutputTokens: this.reservedOutputTokens,
      modelKey: key,
      cachedAt: new Date().toISOString(),
    };
    cache.set(key, fallback);
    return fallback;
  }

  private async discoverFromProvider(): Promise<WindowInfo | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
    try {
      if (this.provider === 'ollama') {
        const url = `${this.baseUrl.replace(/\/$/, '')}/api/show?model=${encodeURIComponent(this.model)}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as any;
        const modelInfo = data.model_info || {};
        // pick max context_length across keys
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
          return {
            contextWindow: max,
            windowSource: 'provider',
            provider: this.provider,
            providerFieldUsed: `model_info.${field}`,
            reservedOutputTokens: this.reservedOutputTokens,
            modelKey: this.modelKey(),
            cachedAt: new Date().toISOString(),
          };
        }
      } else if (this.provider === 'lmstudio') {
        const url = `${this.baseUrl.replace(/\/$/, '')}/api/v0/models`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as any;
        const model = Array.isArray(data.data) ? data.data.find((m: any) => m.id === this.model) : null;
        const v = model?.max_context_length ?? model?.window_context_length ?? model?.loaded_context_length;
        const max = Number(v);
        if (Number.isInteger(max) && max > 0) {
          return {
            contextWindow: max,
            windowSource: 'provider',
            provider: this.provider,
            providerFieldUsed: 'data[].max_context_length',
            reservedOutputTokens: this.reservedOutputTokens,
            modelKey: this.modelKey(),
            cachedAt: new Date().toISOString(),
          };
        }
      } else if (this.provider === 'vllm') {
        const url = `${this.baseUrl.replace(/\/$/, '')}/v1/models`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as any;
        const model = Array.isArray(data.data) ? data.data.find((m: any) => m.id === this.model) : null;
        const max = Number(model?.max_model_len);
        if (Number.isInteger(max) && max > 0) {
          return {
            contextWindow: max,
            windowSource: 'provider',
            provider: this.provider,
            providerFieldUsed: 'data[].max_model_len',
            reservedOutputTokens: this.reservedOutputTokens,
            modelKey: this.modelKey(),
            cachedAt: new Date().toISOString(),
          };
        }
      }
    } catch (e) {
      // swallow, fallback
    } finally {
      clearTimeout(timeout);
    }
    return null;
  }

  /** Invalidate cache for this model (or all if called without args) */
  invalidateWindowCache(modelKey?: string): void {
    if (modelKey) {
      cache.delete(modelKey);
    } else {
      cache.clear();
    }
  }

  /** Check if cache has valid entry for this model */
  hasValidCache(): boolean {
    const key = this.modelKey();
    const cached = cache.get(key);
    if (!cached) return false;
    const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
    return cacheAge < WINDOW_CACHE_TTL_MS;
  }
}