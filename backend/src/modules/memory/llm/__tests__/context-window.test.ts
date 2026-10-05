/**
 * Unit tests — ContextWindowDiscovery (SA4E-338 A1).
 * Covers UT-01..UT-11 from STC.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContextWindowDiscovery, parsePositiveInt, parseEnvPositiveInt, resolveOllamaContextLength } from '../context-window.js';
import type { LLMConfig } from '../types.js';

function makeCfg(overrides?: Partial<LLMConfig>): LLMConfig {
  return { provider: 'ollama', model: 'qwen2.5:7b', baseUrl: 'http://localhost:11434', ...overrides };
}

// ---------------------------------------------------------------------------
// helpers — fetch mock
// ---------------------------------------------------------------------------
function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });
}

function mockFetchError(msg: string) {
  return vi.fn().mockRejectedValue(new Error(msg));
}

function mockFetchStatus(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });
}

describe('parsePositiveInt', () => {
  it('accepts positive integers', () => {
    expect(parsePositiveInt(8192)).toBe(8192);
    expect(parsePositiveInt(1)).toBe(1);
  });
  it('rejects strings, null, floats, ≤0', () => {
    expect(parsePositiveInt('4096')).toBeNull();
    expect(parsePositiveInt(null)).toBeNull();
    expect(parsePositiveInt(0)).toBeNull();
    expect(parsePositiveInt(-5)).toBeNull();
    expect(parsePositiveInt(3.14)).toBeNull();
    expect(parsePositiveInt(undefined)).toBeNull();
  });
});

describe('parseEnvPositiveInt', () => {
  it('accepts valid env strings', () => {
    expect(parseEnvPositiveInt('32768')).toBe(32768);
    expect(parseEnvPositiveInt('8192')).toBe(8192);
  });
  it('rejects invalid env strings', () => {
    expect(parseEnvPositiveInt('8k')).toBeNull();
    expect(parseEnvPositiveInt('-5')).toBeNull();
    expect(parseEnvPositiveInt('0')).toBeNull();
    expect(parseEnvPositiveInt('')).toBeNull();
  });
});

describe('resolveOllamaContextLength', () => {
  it('picks MAX of arch-suffixed keys (OI-01)', () => {
    const result = resolveOllamaContextLength({
      'general.architecture': 'qwen2',
      'qwen2.context_length': 32768,
      'llama.context_length': 8192,
    });
    expect(result).toEqual({ key: 'qwen2.context_length', value: 32768 });
  });
  it('returns null for missing/empty model_info', () => {
    expect(resolveOllamaContextLength({})).toBeNull();
    expect(resolveOllamaContextLength(null)).toBeNull();
  });
  it('ignores non-integer / ≤0 values', () => {
    expect(resolveOllamaContextLength({ 'x.context_length': '4096' })).toBeNull();
    expect(resolveOllamaContextLength({ 'x.context_length': 0 })).toBeNull();
    expect(resolveOllamaContextLength({ 'x.context_length': -1 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ContextWindowDiscovery — getContextWindow
// ---------------------------------------------------------------------------
describe('ContextWindowDiscovery.getContextWindow', () => {
  let discovery: ContextWindowDiscovery;

  beforeEach(() => { discovery = new ContextWindowDiscovery(); });
  afterEach(() => { discovery.invalidate(); vi.restoreAllMocks(); });

  // UT-01: env override valid → windowSource='env', zero provider calls
  it('UT-01: env override valid → windowSource=env, no provider call', async () => {
    const orig = process.env.LLM_CONTEXT_WINDOW;
    process.env.LLM_CONTEXT_WINDOW = '32768';
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    global.fetch = fetchSpy as any;

    const info = await discovery.getContextWindow(makeCfg());
    expect(info.contextWindow).toBe(32768);
    expect(info.windowSource).toBe('env');
    expect(fetchSpy).toHaveBeenCalledTimes(0);

    if (orig !== undefined) process.env.LLM_CONTEXT_WINDOW = orig;
    else delete process.env.LLM_CONTEXT_WINDOW;
  });

  // UT-02: invalid env → warn + ignore override
  it('UT-02: invalid env → warn + ignore, falls through to provider', async () => {
    const orig = process.env.LLM_CONTEXT_WINDOW;
    process.env.LLM_CONTEXT_WINDOW = '8k';
    const fetchSpy = mockFetch({ model_info: { 'qwen2.context_length': 131072 } });
    global.fetch = fetchSpy as any;

    const info = await discovery.getContextWindow(makeCfg({ provider: 'ollama' }));
    expect(info.windowSource).toBe('provider');
    expect(info.contextWindow).toBe(131072);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    if (orig !== undefined) process.env.LLM_CONTEXT_WINDOW = orig;
    else delete process.env.LLM_CONTEXT_WINDOW;
  });

  // UT-03: Ollama arch-suffixed resolver picks MAX
  it('UT-03: Ollama arch-suffixed resolver picks MAX of *.context_length', async () => {
    const fetchSpy = mockFetch({ model_info: { 'qwen2.context_length': 32768, 'llama.context_length': 8192 } });
    global.fetch = fetchSpy as any;

    const info = await discovery.getContextWindow(makeCfg({ provider: 'ollama' }));
    expect(info.contextWindow).toBe(32768);
    expect(info.windowSource).toBe('provider');
    expect(info.providerFieldUsed).toBe('model_info.qwen2.context_length');
  });

  // UT-04: Ollama model→name retry on 400/404
  it('UT-04: Ollama {model} first, retry {name} on 400/404', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, text: () => Promise.resolve('{"error":"invalid request body"}'), json: () => Promise.resolve({ error: 'invalid request body' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ model_info: { 'qwen2.context_length': 32768 } }) });
    global.fetch = fetchSpy as any;

    const info = await discovery.getContextWindow(makeCfg({ provider: 'ollama' }));
    expect(info.contextWindow).toBe(32768);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // first call with {model}, second with {name}
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ model: 'qwen2.5:7b' });
    expect(JSON.parse(fetchSpy.mock.calls[1][1].body)).toEqual({ name: 'qwen2.5:7b' });
  });

  // UT-05: LM Studio field chain max_context_length
  it('UT-05: LM Studio field chain max_context_length', async () => {
    const fetchSpy = mockFetch({ data: [{ id: 'qwen2.5-7b-instruct', max_context_length: 32768, state: 'loaded' }] });
    global.fetch = fetchSpy as any;

    const info = await discovery.getContextWindow(makeCfg({ provider: 'lmstudio' }));
    expect(info.contextWindow).toBe(32768);
    expect(info.windowSource).toBe('provider');
    expect(info.providerFieldUsed).toBe('data[].max_context_length');
  });

  // UT-06: vLLM max_model_len
  it('UT-06: vLLM max_model_len', async () => {
    const fetchSpy = mockFetch({ data: [{ id: 'meta-llama/Llama-3.1-8B-Instruct', max_model_len: 131072 }] });
    global.fetch = fetchSpy as any;

    const info = await discovery.getContextWindow(makeCfg({ provider: 'vllm' }));
    expect(info.contextWindow).toBe(131072);
    expect(info.windowSource).toBe('provider');
    expect(info.providerFieldUsed).toBe('data[].max_model_len');
  });

  // UT-07: missing / non-numeric / null / ≤0 → fallback 8192
  it('UT-07: missing/invalid context field → fallback 8192', async () => {
    const fetchSpy = mockFetch({ model_info: {} });
    global.fetch = fetchSpy as any;

    const info = await discovery.getContextWindow(makeCfg({ provider: 'ollama' }));
    expect(info.contextWindow).toBe(8192);
    expect(info.windowSource).toBe('fallback');
  });

  // UT-08: provider timeout / connection refused → fallback within 5s, no throw
  it('UT-08: provider timeout/connection refused → fallback 8192, no throw, ≤5s', async () => {
    const fetchSpy = vi.fn().mockImplementation(() => new Promise(() => {})); // never resolves
    global.fetch = fetchSpy as any;

    const start = Date.now();
    const info = await discovery.getContextWindow(makeCfg());
    const elapsed = Date.now() - start;
    expect(info.contextWindow).toBe(8192);
    expect(info.windowSource).toBe('fallback');
    expect(elapsed).toBeLessThanOrEqual(6000); // generous bound
  });

  it('UT-08b: connection refused → fallback 8192', async () => {
    const fetchSpy = mockFetchError('ECONNREFUSED 127.0.0.1:11434');
    global.fetch = fetchSpy as any;

    const info = await discovery.getContextWindow(makeCfg());
    expect(info.contextWindow).toBe(8192);
    expect(info.windowSource).toBe('fallback');
  });

  // UT-09: discovery auth failure 401/403 → warn + fallback
  it('UT-09: discovery auth failure 401 → warn + fallback', async () => {
    const fetchSpy = mockFetchStatus(401, { error: 'invalid api key' });
    global.fetch = fetchSpy as any;

    const info = await discovery.getContextWindow(makeCfg({ provider: 'lmstudio' }));
    expect(info.contextWindow).toBe(8192);
    expect(info.windowSource).toBe('fallback');
  });

  // UT-09b: LM Studio endpoint absent (404) → fallback, no version probe
  it('UT-09b: LM Studio 404 → fallback 8192, no version probe (OI-09)', async () => {
    const fetchSpy = mockFetchStatus(404, { error: 'Not Found' });
    global.fetch = fetchSpy as any;

    const info = await discovery.getContextWindow(makeCfg({ provider: 'lmstudio' }));
    expect(info.contextWindow).toBe(8192);
    expect(info.windowSource).toBe('fallback');
    // Only 1 request (no version probe)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain('/api/v0/models');
  });

  // UT-10: session cache — 1 provider call per modelKey + invalidation
  it('UT-10: session cache — 1 call per modelKey, invalidation on change', async () => {
    const fetchSpy = mockFetch({ model_info: { 'qwen2.context_length': 131072 } });
    global.fetch = fetchSpy as any;

    const cfg = makeCfg();
    const info1 = await discovery.getContextWindow(cfg);
    const info2 = await discovery.getContextWindow(cfg);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // cached
    expect(info1.contextWindow).toEqual(info2.contextWindow);

    // Change model → cache miss → new call
    discovery.invalidate(`${cfg.provider}:${cfg.model}:${cfg.baseUrl}`);
    const info3 = await discovery.getContextWindow({ ...cfg, model: 'other-model' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(info3.contextWindow).toBe(131072);
  });

  // UT-11: BR-20 validation — window ≤ reserved+overhead → fallback; fallback failing → error log
  it('UT-11: BR-20 — provider value ≤ reserved+overhead → fallback', async () => {
    const fetchSpy = mockFetch({ model_info: { 'x.context_length': 512 } });
    global.fetch = fetchSpy as any;

    const info = await discovery.getContextWindow(makeCfg({ provider: 'ollama', maxTokens: 800 }));
    expect(info.contextWindow).toBe(8192);
    expect(info.windowSource).toBe('fallback');
  });
});

describe('ContextWindowDiscovery.invalidate', () => {
  it('clears one entry or whole cache', () => {
    const d = new ContextWindowDiscovery();
    d.invalidate(); // no-op on empty cache — no throw
    d.invalidate('some:key'); // no-op on missing key — no throw
  });
});
