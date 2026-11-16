/**
 * SA4E-422 — provider-selected token counters: interface choice by provider,
 * documented heuristic bounds, and no /tokenize request to hosted providers.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  HeuristicTokenCounter,
  RuntimeEndpointTokenCounter,
  measureStaticTokensForProvider,
  selectTokenCounter,
} from '../token-counter';
import { estimateWireTokens } from '../prompt-compressor';

const okFetch = () =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tokens: [1, 2, 3] }) }) as unknown as Response);

describe('SA4E-422 selectTokenCounter', () => {
  it('local runtime providers + baseUrl → exact runtime counter', () => {
    for (const id of ['lmstudio', 'ollama', 'llamacpp', 'onnx']) {
      const c = selectTokenCounter({ providerId: id, baseUrl: 'http://127.0.0.1:8080/v1' });
      expect(c).toBeInstanceOf(RuntimeEndpointTokenCounter);
      expect(c.exact).toBe(true);
    }
  });

  it('hosted providers → heuristic counter even when a baseUrl is set', () => {
    for (const id of ['openai', 'anthropic', 'google', 'some-new-provider']) {
      const c = selectTokenCounter({ providerId: id, baseUrl: 'https://api.example.com/v1' });
      expect(c).toBeInstanceOf(HeuristicTokenCounter);
      expect(c.exact).toBe(false);
      expect(c.relativeError).toBeGreaterThan(0);
    }
  });

  it('uses per-provider profile ids; unknown falls back to default', () => {
    expect(selectTokenCounter({ providerId: 'OpenAI' }).id).toBe('heuristic-openai');
    expect(selectTokenCounter({ providerId: 'anthropic' }).id).toBe('heuristic-anthropic');
    expect(selectTokenCounter({ providerId: 'mystery' }).id).toBe('heuristic-default');
  });

  it('local provider without baseUrl degrades to heuristic (no network target)', () => {
    expect(selectTokenCounter({ providerId: 'lmstudio' }).exact).toBe(false);
  });
});

describe('SA4E-422 HeuristicTokenCounter bounds', () => {
  const openai = new HeuristicTokenCounter({ id: 'h', charsPerToken: 3.5, margin: 0.1 });

  it('empty → 0; ASCII = ceil(len/cpt*(1+margin))', async () => {
    expect(await openai.count('')).toBe(0);
    expect(openai.estimate('a'.repeat(350))).toBe(Math.ceil((350 / 3.5) * 1.1));
  });

  it('counts each non-ASCII char as one token (over-count bias for CJK/diacritics)', () => {
    expect(openai.estimate('日本語')).toBe(Math.ceil(3 * 1.1));
  });

  it('is never below the raw chars/4 prose lower bound for English text', () => {
    const prose = 'The quick brown fox jumps over the lazy dog. '.repeat(40);
    expect(openai.estimate(prose)).toBeGreaterThanOrEqual(Math.ceil(prose.length / 4));
  });

  it('default profile is no less conservative than SA4E-369 estimateWireTokens per char', () => {
    const def = selectTokenCounter({ providerId: 'mystery' }) as HeuristicTokenCounter;
    const text = 'function foo(a, b) { return a + b; }\n'.repeat(50);
    expect(def.estimate(text)).toBeGreaterThanOrEqual(estimateWireTokens(text));
  });
});

describe('SA4E-422 measureStaticTokensForProvider', () => {
  const files = [{ content: 'alpha' }];

  it('local provider → exact count from /tokenize', async () => {
    const fetchFn = okFetch();
    const n = await measureStaticTokensForProvider(
      { providerId: 'lmstudio', baseUrl: 'http://127.0.0.1:1234/v1', fetchFn: fetchFn as unknown as typeof fetch },
      files,
      'prompt',
    );
    expect(n).toBe(3);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('hosted provider → undefined and NO network call (no prompt leakage)', async () => {
    const fetchFn = okFetch();
    const n = await measureStaticTokensForProvider(
      { providerId: 'openai', baseUrl: 'https://api.openai.com/v1', fetchFn: fetchFn as unknown as typeof fetch },
      files,
      'prompt',
    );
    expect(n).toBeUndefined();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('unknown providerId (undefined) keeps the SA4E-422 runtime probe', async () => {
    const fetchFn = okFetch();
    const n = await measureStaticTokensForProvider(
      { baseUrl: 'http://127.0.0.1:8080/v1', fetchFn: fetchFn as unknown as typeof fetch },
      files,
      'prompt',
    );
    expect(n).toBe(3);
  });
});
