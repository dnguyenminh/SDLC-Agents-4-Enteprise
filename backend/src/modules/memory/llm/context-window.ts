export type WindowSource = 'env' | 'provider' | 'fallback';
export type LLMProviderId = 'ollama' | 'lmstudio' | 'vllm' | string;

import { discoverWindowFromProvider } from './window-providers.js';

export interface WindowInfo {
  contextWindow: number;
  windowSource: WindowSource;
  provider: LLMProviderId;
  providerFieldUsed?: string;
  reservedOutputTokens: number;
  modelKey: string;
  cachedAt: string;
}

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

function makeInfo(
  contextWindow: number,
  windowSource: WindowInfo['windowSource'],
  provider: LLMProviderId,
  reservedOutputTokens: number,
  modelKey: string,
): WindowInfo {
  return {
    contextWindow,
    windowSource,
    provider,
    reservedOutputTokens,
    modelKey,
    cachedAt: new Date().toISOString(),
  };
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
    const key = this.modelKey();

    // 1. Per-model env override: LLM_CONTEXT_WINDOW__<model>
    const fromPerModel = this.fromEnv(process.env[`LLM_CONTEXT_WINDOW__${this.model}`]);
    if (fromPerModel) { cache.set(key, fromPerModel); return fromPerModel; }

    // 2. Fallback to global LLM_CONTEXT_WINDOW (deprecated but supported)
    const envVal = process.env.LLM_CONTEXT_WINDOW;
    const fromGlobal = this.fromEnv(envVal);
    if (fromGlobal) { cache.set(key, fromGlobal); return fromGlobal; }
    if (envVal && !fromGlobal) {
      console.warn('ERR-02 LLM_CONTEXT_WINDOW invalid — ignoring override');
    }

    // 3. Check TTL cache
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
      const info = await discoverWindowFromProvider(
        this.provider, this.model, this.baseUrl, this.reservedOutputTokens, key,
      );
      if (info) {
        cache.set(key, info);
        return info;
      }
    } catch {
      console.warn('ERR-01 context window fallback to 8192');
    }

    // 5. Fallback
    const fallback = makeInfo(FALLBACK_WINDOW, 'fallback', this.provider, this.reservedOutputTokens, key);
    cache.set(key, fallback);
    return fallback;
  }

  /** Build a WindowInfo from a valid env override, or null when unset/invalid. */
  private fromEnv(value: string | undefined): WindowInfo | null {
    const parsed = parsePositiveInt(value);
    if (parsed === null) { return null; }
    return makeInfo(parsed, 'env', this.provider, this.reservedOutputTokens, this.modelKey());
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
