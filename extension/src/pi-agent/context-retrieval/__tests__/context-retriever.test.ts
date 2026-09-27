import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ContextRetriever } from '../../context-retriever';
import { RetrievalValidationError } from '../types';
import type { ISearchProvider, IFileLister, SearchCandidate } from '../types';

const fakeLister: IFileLister = {
  listDir: vi.fn((dir: string, cursor: number, pageSize: number) => {
    const entries =
      dir === 'root'
        ? [
            { name: 'src', isDirectory: true },
            { name: 'auth.ts', isDirectory: false },
          ]
        : dir.endsWith('src')
          ? [
              { name: 'session.ts', isDirectory: false },
              { name: 'budget.ts', isDirectory: false },
            ]
          : [];
    const page = entries.slice(cursor, cursor + pageSize);
    const next = cursor + pageSize;
    return next < entries.length ? { entries: page, nextCursor: next } : { entries: page };
  }),
};

function candidate(index: number, filePath?: string): SearchCandidate {
  return {
    name: `symbol${index}`,
    filePath: filePath ?? `src/file${index}.ts`,
    kind: 'function',
    signature: `(a${index}: number) => ${index}`,
    source: 'code_search',
  };
}

function fakeProvider(results: SearchCandidate[] | Error): ISearchProvider {
  return {
    search: vi.fn(async () => {
      if (results instanceof Error) throw results;
      return results;
    }),
  };
}

function retriever(provider: ISearchProvider, overrides: Record<string, unknown> = {}) {
  return new ContextRetriever({
    searchProvider: provider,
    rootDir: 'root',
    fileLister: fakeLister,
    ...overrides,
  });
}

describe('ContextRetriever.retrieve', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-retriever-'));
    for (let i = 0; i < 20; i += 1) {
      fs.writeFileSync(
        path.join(tmpDir, `file${i}.ts`),
        Array.from({ length: 80 }, (_, line) => `export const line${line}_${i} = ${line};`).join('\n')
      );
    }
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('TC-001: happy path populates contextFiles within budget', async () => {
    const provider = fakeProvider(Array.from({ length: 20 }, (_, i) => candidate(i)));
    const result = await retriever(provider).retrieve('review auth flow', 20);

    expect(provider.search).toHaveBeenCalledWith('review auth flow', 20);
    expect(result.contextFiles.length).toBeGreaterThan(0);
    expect(result.totalTokens).toBeLessThan(6000);
    expect(result.intent).toBe('LOCAL');
  });

  it('TC-002/TC-302: progressive disclosure upgrades readable files to chunk tier within budget', async () => {
    const provider = fakeProvider(
      Array.from({ length: 20 }, (_, i) => candidate(i, path.join(tmpDir, `file${i}.ts`)))
    );
    // SEC-325-D1: absolute candidates must live under rootDir to stay contained.
    const result = await retriever(provider, { rootDir: tmpDir }).retrieve('review auth flow');

    expect(result.totalTokens).toBeLessThanOrEqual(6000);
    expect(result.tier).toBe('chunk');
    expect(result.contextFiles[0].tier).toBe('chunk');
  });

  it('SEC-325-D1: MCP-derived paths escaping rootDir never reach contextFiles', async () => {
    const poisoned: SearchCandidate[] = [
      { name: 'AwsCreds', filePath: '/home/user/.aws/credentials', kind: 'class', source: 'mem_search' },
      { name: 'traversal', filePath: '../evil.ts', kind: 'function', source: 'code_search' },
      { name: 'local', filePath: 'src/keep.ts', kind: 'function', source: 'code_search' },
    ];
    const result = await retriever(fakeProvider(poisoned)).retrieve('review auth flow');
    expect(result.contextFiles.map((f) => f.path)).toEqual(['src/keep.ts']);
  });

  it('SEC-325-D1: fully-poisoned results degrade to empty context (no file read)', async () => {
    const poisoned: SearchCandidate[] = [
      { name: 'AwsCreds', filePath: '/home/user/.aws/credentials', kind: 'class', source: 'mem_search' },
    ];
    const result = await retriever(fakeProvider(poisoned)).retrieve('review auth flow');
    expect(result.contextFiles).toEqual([]);
    expect(result.totalTokens).toBe(0);
    expect(result.warning).toBeDefined();
  });

  it('TC-003/TC-705: excluded paths never appear in contextFiles', async () => {
    const provider = fakeProvider([
      candidate(1, 'src/keep.ts'),
      candidate(2, 'node_modules/pkg/index.js'),
      candidate(3, '.git/config.ts'),
      candidate(4, 'dist/bundle.ts'),
      candidate(5, 'out/build.ts'),
    ]);
    const result = await retriever(provider).retrieve('auth flow');
    expect(result.contextFiles.map((f) => f.path)).toEqual(['src/keep.ts']);
  });

  it('TC-101: GLOBAL intent returns a summary tree instead of per-file scan', async () => {
    const provider = fakeProvider([candidate(1)]);
    const result = await retriever(provider).retrieve('explain the architecture of this project');

    expect(provider.search).not.toHaveBeenCalled();
    expect(result.tier).toBe('summary');
    expect(result.summary).toContain('auth.ts');
    expect(result.contextFiles).toEqual([]);
  });

  it('TC-102/TC-202: search failure falls back to summary tree', async () => {
    const provider = fakeProvider(new Error('search timeout'));
    const result = await retriever(provider).retrieve('review auth flow');

    expect(result.tier).toBe('summary');
    expect(result.summary).toBeDefined();
  });

  it('TC-201: no results returns empty context with warning', async () => {
    const provider = fakeProvider([]);
    const result = await retriever(provider).retrieve('zzz unmatched query');

    expect(result.contextFiles).toEqual([]);
    expect(result.totalTokens).toBe(0);
    expect(result.warning).toBeDefined();
  });

  it('TC-301: topK > 20 is capped to 20', async () => {
    const provider = fakeProvider(Array.from({ length: 20 }, (_, i) => candidate(i)));
    await retriever(provider).retrieve('review auth flow', 25);
    expect(provider.search).toHaveBeenCalledWith('review auth flow', 20);
  });

  it('TC-401: topK = 0 raises a validation error', async () => {
    await expect(retriever(fakeProvider([])).retrieve('query', 0)).rejects.toThrow(
      RetrievalValidationError
    );
  });

  it('TC-402: empty query raises a validation error', async () => {
    await expect(retriever(fakeProvider([])).retrieve('   ')).rejects.toThrow(
      RetrievalValidationError
    );
  });

  it('TC-703: token counter totals match the sum of context file tokens', async () => {
    const provider = fakeProvider(Array.from({ length: 5 }, (_, i) => candidate(i)));
    const result = await retriever(provider).retrieve('symbol2');
    const sum = result.contextFiles.reduce((total, file) => total + file.tokens, 0);
    expect(result.totalTokens).toBe(sum);
  });

  it('TC-303/TC-802: 1000-file repo retrieval completes under 500ms and 6k tokens', async () => {
    const provider = fakeProvider(Array.from({ length: 1000 }, (_, i) => candidate(i)));
    const started = Date.now();
    const result = await retriever(provider).retrieve('symbol500');
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(500);
    expect(result.totalTokens).toBeLessThanOrEqual(6000);
    expect(result.contextFiles.length).toBeGreaterThan(0);
    expect(result.contextFiles.length).toBeLessThanOrEqual(20);
  });

  it('SA4E-327 TC-703: GLOBAL intent is routed to map-reduce when processor is configured', async () => {
    const provider = fakeProvider([candidate(1)]);
    const processor = {
      process: vi.fn(async () => ({
        query: 'explain the architecture',
        intent: 'GLOBAL',
        contextFiles: [
          { path: 'map-reduce://batch-1', outline: 'summary', tokens: 3, tier: 'map-reduce' as const },
        ],
        totalTokens: 3,
        tier: 'map-reduce' as const,
        summary: 'synthesized answer',
      })),
    };
    const result = await retriever(provider, { largeQueryProcessor: processor as any }).retrieve(
      'explain the architecture'
    );
    expect(processor.process).toHaveBeenCalled();
    expect(result.tier).toBe('map-reduce');
  });

  it('SA4E-327: map-reduce failure falls back to summary tree', async () => {
    const provider = fakeProvider([candidate(1)]);
    const processor = { process: vi.fn(async () => null) };
    const result = await retriever(provider, { largeQueryProcessor: processor as any }).retrieve(
      'explain the architecture'
    );
    expect(result.tier).toBe('summary');
  });
});
