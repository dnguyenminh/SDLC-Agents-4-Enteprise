/**
 * SA4E-422 — runtime tokenizer tests (16K Doc §4: real tokenizer via the
 * model runtime endpoint; fail-open to estimates on any failure).
 */

import { describe, it, expect, vi } from 'vitest';
import { measureRuntimeStaticTokens, tryRuntimeTokenCount } from '../runtime-tokenizer';

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

describe('SA4E-422 tryRuntimeTokenCount', () => {
  it('llama.cpp payload {tokens:[...]} → exact count', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ tokens: [1, 2, 3, 4] })) as unknown as typeof fetch;
    const n = await tryRuntimeTokenCount('hello world', { baseUrl: 'http://127.0.0.1:8080/v1', fetchFn });
    expect(n).toBe(4);
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8080/v1/tokenize');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ content: 'hello world' });
  });

  it('accepts {count} from other servers', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ count: 42 })) as unknown as typeof fetch;
    expect(await tryRuntimeTokenCount('x', { baseUrl: 'http://s', fetchFn })).toBe(42);
  });

  it('derives /tokenize without trailing slash duplication', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ tokens: [] })) as unknown as typeof fetch;
    await tryRuntimeTokenCount('x', { baseUrl: 'http://s:8080/v1/', fetchFn });
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('http://s:8080/v1/tokenize');
  });

  it('empty text / missing baseUrl → null without any fetch', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    expect(await tryRuntimeTokenCount('', { baseUrl: 'http://s', fetchFn })).toBeNull();
    expect(await tryRuntimeTokenCount('x', { baseUrl: '', fetchFn })).toBeNull();
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('fail-open: HTTP error, network throw, timeout, bad payload → null', async () => {
    const http500 = vi.fn(async () => jsonResponse({}, 500)) as unknown as typeof fetch;
    expect(await tryRuntimeTokenCount('x', { baseUrl: 'http://s', fetchFn: http500 })).toBeNull();

    const netErr = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect(await tryRuntimeTokenCount('x', { baseUrl: 'http://s', fetchFn: netErr })).toBeNull();

    const abort = vi.fn(async () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    }) as unknown as typeof fetch;
    expect(await tryRuntimeTokenCount('x', { baseUrl: 'http://s', fetchFn: abort, timeoutMs: 5 })).toBeNull();

    const badShape = vi.fn(async () => jsonResponse({ nope: true })) as unknown as typeof fetch;
    expect(await tryRuntimeTokenCount('x', { baseUrl: 'http://s', fetchFn: badShape })).toBeNull();
  });
});

describe('SA4E-422 measureRuntimeStaticTokens', () => {
  it('no baseUrl or empty files → undefined (caller uses estimates)', async () => {
    expect(await measureRuntimeStaticTokens(undefined, [{ content: 'a' }], 'p')).toBeUndefined();
    expect(await measureRuntimeStaticTokens('http://s', [], 'p')).toBeUndefined();
  });

  it('measures files + workspace prompt through the endpoint', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ tokens: [1, 2, 3, 4, 5] })) as unknown as typeof fetch;
    const n = await measureRuntimeStaticTokens('http://s', [{ content: 'a' }, { content: 'b' }], 'prompt', fetchFn);
    expect(n).toBe(5);
    const sent = JSON.parse(((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit).body as string);
    expect(sent.content).toContain('a');
    expect(sent.content).toContain('b');
    expect(sent.content).toContain('prompt');
  });

  it('endpoint failure → undefined (never throws)', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    expect(await measureRuntimeStaticTokens('http://s', [{ content: 'a' }], 'p', fetchFn)).toBeUndefined();
  });
});
