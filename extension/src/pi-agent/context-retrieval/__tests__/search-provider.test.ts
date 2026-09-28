import { describe, it, expect, vi } from 'vitest';
import { withTimeout } from '../../async-timeout';
import {
  McpSearchProvider,
  dedupeCandidates,
  extractText,
  parseSearchText,
} from '../search-provider';
import { DEFAULT_RETRIEVAL_CONFIG } from '../types';
import type { SearchCandidate } from '../types';

const CODE_SEARCH_OUTPUT = `Found 3 results for "auth":

[function] login
  File: src/auth/login.ts:42
  Sig: login(user: string, pass: string): Promise<Token>
  Doc: Authenticates a user against the identity provider

[class] AuthService
  File: src/auth/service.ts:10
  Sig: class AuthService extends BaseService

No results found for "zzz"`;

describe('parseSearchText', () => {
  it('parses kind, name, file, line, signature and doc', () => {
    const candidates = parseSearchText(CODE_SEARCH_OUTPUT, 'code_search');
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      kind: 'function',
      name: 'login',
      filePath: 'src/auth/login.ts',
      startLine: 42,
      source: 'code_search',
    });
    expect(candidates[0].signature).toContain('Promise<Token>');
    expect(candidates[0].docComment).toContain('identity provider');
    expect(candidates[1].name).toBe('AuthService');
  });

  it('keeps the entry title as fallback path for mem_search results', () => {
    const candidates = parseSearchText('[CONTEXT] Some KB entry about budget\n  ID: 123 | Tier: WORKING', 'mem_search');
    expect(candidates[0].filePath).toBe('Some KB entry about budget');
    expect(candidates[0].source).toBe('mem_search');
  });

  it('returns empty list for empty text', () => {
    expect(parseSearchText('', 'code_search')).toEqual([]);
  });
});

describe('extractText', () => {
  it('joins content text blocks', () => {
    const raw = { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] };
    expect(extractText(raw)).toBe('a\nb');
  });

  it('passes through raw strings', () => {
    expect(extractText('plain')).toBe('plain');
  });
});

describe('dedupeCandidates', () => {
  it('removes duplicates by file and name', () => {
    const a: SearchCandidate = { name: 'x', filePath: 'src/a.ts', kind: 'function', source: 'code_search' };
    expect(dedupeCandidates([a, { ...a }, { ...a, filePath: 'src/b.ts' }])).toHaveLength(2);
  });
});

describe('withTimeout (shared async-timeout used by retrieval + map-reduce)', () => {
  it('rejects when the promise exceeds the timeout', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 500));
    await expect(withTimeout(slow, 10, 'timed out')).rejects.toThrow('timed out');
  });

  it('resolves when the promise is fast enough', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 100, 'timed out')).resolves.toBe('ok');
  });
});

describe('McpSearchProvider', () => {
  function payload(text: string): unknown {
    return { content: [{ type: 'text', text }] };
  }

  function provider(caller: { callMcpWrapper: ReturnType<typeof vi.fn> }, overrides = {}) {
    return new McpSearchProvider({
      caller: caller as any,
      config: { ...DEFAULT_RETRIEVAL_CONFIG, retryBackoffMs: 1, searchTimeoutMs: 500, ...overrides },
    });
  }

  it('TC-701: calls code_search and mem_search with query and topK limit', async () => {
    const caller = {
      callMcpWrapper: vi.fn(async (tool: string) =>
        tool === 'code_search' ? payload(CODE_SEARCH_OUTPUT) : payload('[CONTEXT] entry')
      ),
    };
    const result = await provider(caller).search('auth', 20);
    expect(caller.callMcpWrapper).toHaveBeenCalledWith('code_search', { query: 'auth', limit: 20 });
    expect(caller.callMcpWrapper).toHaveBeenCalledWith('mem_search', { query: 'auth', limit: 20 });
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it('retries once with backoff when code_search fails then succeeds', async () => {
    const caller = {
      callMcpWrapper: vi
        .fn()
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValue(payload(CODE_SEARCH_OUTPUT)),
    };
    const result = await provider(caller).search('auth', 20);
    expect(result.length).toBeGreaterThan(0);
    expect(caller.callMcpWrapper).toHaveBeenCalledTimes(3);
  });

  it('falls back to summary-tree path by throwing after final code_search failure', async () => {
    const caller = { callMcpWrapper: vi.fn().mockRejectedValue(new Error('down')) };
    await expect(provider(caller).search('auth', 20)).rejects.toThrow('down');
    expect(caller.callMcpWrapper.mock.calls.filter(([tool]) => tool === 'code_search')).toHaveLength(2);
  });

  it('continues without mem_search when it fails', async () => {
    const caller = {
      callMcpWrapper: vi.fn(async (tool: string) => {
        if (tool === 'mem_search') throw new Error('mem down');
        return payload(CODE_SEARCH_OUTPUT);
      }),
    };
    const result = await provider(caller).search('auth', 20);
    expect(result.length).toBeGreaterThan(0);
  });

  it('slices results to topK', async () => {
    const many = Array.from({ length: 30 }, (_, i) => `[function] sym${i}\n  File: src/f${i}.ts:${i}`).join('\n');
    const caller = { callMcpWrapper: vi.fn(async () => payload(many)) };
    const result = await provider(caller).search('query', 5);
    expect(result).toHaveLength(5);
  });
});
