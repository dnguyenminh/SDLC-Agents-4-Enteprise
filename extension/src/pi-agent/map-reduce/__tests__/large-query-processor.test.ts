import { describe, it, expect, vi } from 'vitest';
import { LargeQueryProcessor } from '../large-query-processor';
import { FileScanner } from '../../context-retrieval/file-scanner';
import type { MapReduceResult } from '../types';

function fakeScanner(fileCount: number): FileScanner {
  const files = Array.from({ length: fileCount }, (_, i) => `src/file${i}.ts`);
  return {
    listSourceFiles: vi.fn((_root: string, options: { maxFiles?: number }) =>
      files.slice(0, options?.maxFiles ?? 500)
    ),
  } as unknown as FileScanner;
}

function fakeOrchestrator(result?: Partial<MapReduceResult> | Error) {
  const run = vi.fn(async (): Promise<MapReduceResult> => {
    if (result instanceof Error) throw result;
    return {
      answer: 'The codebase has an auth layer, a session factory and a context pipeline.',
      batches: [
        { id: 'batch-1', files: ['src/file0.ts'], subQuery: 'q', maxTokens: 4000 },
        { id: 'batch-2', files: ['src/file20.ts'], subQuery: 'q', maxTokens: 4000 },
      ],
      partials: [
        { batchId: 'batch-1', summary: 'auth layer summary', tokens: 20, confidence: 0.9 },
        { batchId: 'batch-2', summary: 'session layer summary', tokens: 20, confidence: 0.9 },
      ],
      timedOutBatches: [],
      skippedBatches: [],
      elapsedMs: 10,
      ...result,
    };
  });
  return { run };
}

function processor(orchestrator: { run: ReturnType<typeof vi.fn> }, fileCount: number, overrides = {}) {
  return new LargeQueryProcessor({
    orchestrator: orchestrator as any,
    scanner: fakeScanner(fileCount),
    rootDir: 'root',
    ...overrides,
  });
}

describe('LargeQueryProcessor (SA4E-327)', () => {
  it('TC-703: routes GLOBAL intent to map-reduce', async () => {
    const orchestrator = fakeOrchestrator();
    const result = await processor(orchestrator, 100).process('explain architecture', 'GLOBAL');

    expect(orchestrator.run).toHaveBeenCalledWith('explain architecture', expect.anything());
    expect(result?.tier).toBe('map-reduce');
    expect(result?.summary).toContain('auth layer');
  });

  it('TC-703: routes STRUCTURAL intent to map-reduce', async () => {
    const orchestrator = fakeOrchestrator();
    const result = await processor(orchestrator, 100).process('show project structure', 'STRUCTURAL');
    expect(orchestrator.run).toHaveBeenCalled();
    expect(result?.tier).toBe('map-reduce');
  });

  it('TC-703: LOCAL intent is not routed to map-reduce', async () => {
    const orchestrator = fakeOrchestrator();
    const result = await processor(orchestrator, 100).process('fix the login bug', 'LOCAL');
    expect(result).toBeNull();
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('returns null below the min-file threshold (small repo)', async () => {
    const orchestrator = fakeOrchestrator();
    const result = await processor(orchestrator, 10).process('explain architecture', 'GLOBAL');
    expect(result).toBeNull();
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('caps scanned files at maxFiles', async () => {
    const orchestrator = fakeOrchestrator();
    const proc = processor(orchestrator, 5000);
    await proc.process('explain architecture', 'GLOBAL');
    const files = (orchestrator.run as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[];
    expect(files.length).toBeLessThanOrEqual(200);
  });

  it('keeps total tokens within the 6000 budget', async () => {
    const fatPartial = 'x'.repeat(10_000);
    const orchestrator = fakeOrchestrator({
      partials: [
        { batchId: 'batch-1', summary: fatPartial, tokens: 2500, confidence: 0.9 },
        { batchId: 'batch-2', summary: fatPartial, tokens: 2500, confidence: 0.9 },
        { batchId: 'batch-3', summary: fatPartial, tokens: 2500, confidence: 0.9 },
      ],
    });
    const result = await processor(orchestrator, 100).process('explain architecture', 'GLOBAL');
    expect(result?.totalTokens).toBeLessThanOrEqual(6000);
  });

  it('returns null when map-reduce produces no partial summaries', async () => {
    const orchestrator = fakeOrchestrator({ partials: [], answer: '' });
    const result = await processor(orchestrator, 100).process('explain architecture', 'GLOBAL');
    expect(result).toBeNull();
  });

  it('propagates orchestrator failure so caller falls back to summary tree', async () => {
    const orchestrator = fakeOrchestrator(new Error('map-reduce down'));
    await expect(processor(orchestrator, 100).process('explain architecture', 'GLOBAL')).rejects.toThrow(
      'map-reduce down'
    );
  });
});
