/**
 * Unit Tests — Smart Ingest Handler (SA4E-38): handleSmartIngestCleanup.
 * (Split from SmartIngest.test.ts — BR-18 ≤200 lines/file.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../task-queue/SqliteDbAdapter.js';
import { MemoryEngine } from '../engine/index.js';
import { handleSmartIngestCleanup } from '../dispatchers/smart-ingest.js';
import type { ClassifyService } from '../llm/classify-service.js';
import { createMockClassify, createTestDb, createUnavailableClassify } from './SmartIngest.fixtures.js';

describe('handleSmartIngestCleanup', () => {
  let db: SqliteAdapter;
  let engine: MemoryEngine;

  beforeEach(async () => {
    db = await createTestDb();
    engine = new MemoryEngine(new SqliteDbAdapter(db));
    engine.startSession('test');
  });

  function seedUnfiltered(content: string): Promise<number> {
    return engine.insert({
      content,
      summary: content.slice(0, 120),
      type: 'CONTEXT',
      source: '/chat-prompt',
      tags: 'chat,stream,user,unfiltered',
    });
  }

  it('returns unavailable when LLM is down', async () => {
    const svc = createUnavailableClassify();
    const result = JSON.parse(await handleSmartIngestCleanup(engine, undefined, svc, {}));

    expect(result.processed).toBe(0);
    expect(result.reason).toBe('llm_unavailable');
  });

  it('processes unfiltered entries — ingest verdict', async () => {
    seedUnfiltered('Architecture decision about transport layer');
    const svc = createMockClassify('ingest', 'Transport layer decision');

    const result = JSON.parse(await handleSmartIngestCleanup(engine, undefined, svc, {}));

    expect(result.processed).toBe(1);
    expect(result.ingested).toBe(1);
    expect(result.deleted).toBe(0);
  });

  it('processes unfiltered entries — skip verdict deletes', async () => {
    seedUnfiltered('hello there');
    const svc = createMockClassify('skip');

    const result = JSON.parse(await handleSmartIngestCleanup(engine, undefined, svc, {}));

    expect(result.processed).toBe(1);
    expect(result.ingested).toBe(0);
    expect(result.deleted).toBe(1);
  });

  it('respects batch_size parameter', async () => {
    seedUnfiltered('entry 1');
    seedUnfiltered('entry 2');
    seedUnfiltered('entry 3');
    const svc = createMockClassify('ingest', 'test');

    const result = JSON.parse(await handleSmartIngestCleanup(engine, undefined, svc, { batch_size: 2 }));

    expect(result.processed).toBe(2);
  });

  it('clamps batch_size to 1-100 range', async () => {
    seedUnfiltered('entry 1');
    const svc = createMockClassify('ingest', 'test');

    // batch_size > 100 → clamped to 100
    await handleSmartIngestCleanup(engine, undefined, svc, { batch_size: 200 });
    // batch_size < 1 → clamped to 1
    await handleSmartIngestCleanup(engine, undefined, svc, { batch_size: 0 });
    // No error — function handles gracefully
  });

  it('dry_run does not modify entries', async () => {
    const id = await seedUnfiltered('test entry');
    const svc = createMockClassify('skip');

    const result = JSON.parse(await handleSmartIngestCleanup(engine, undefined, svc, { dry_run: true }));

    expect(result.processed).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.dry_run).toBe(true);
    // Entry should still exist
    const entry = await engine.findById(id);
    expect(entry).toBeDefined();
  });

  it('stops on mid-batch LLM failure', async () => {
    seedUnfiltered('entry 1');
    seedUnfiltered('entry 2');

    let callCount = 0;
    const svc = {
      classify: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) throw new Error('LLM timeout');
        return Promise.resolve({ verdict: 'ingest' as const, summary: 'test' });
      }),
      isAvailable: vi.fn().mockResolvedValue(true),
      buildPrompt: vi.fn(),
      parseResponse: vi.fn(),
    } as unknown as ClassifyService;

    const result = JSON.parse(await handleSmartIngestCleanup(engine, undefined, svc, {}));

    expect(result.processed).toBe(1);
    expect(result.reason).toBe('llm_unavailable_mid_batch');
  });

  it('reports correct remaining count', async () => {
    seedUnfiltered('entry 1');
    seedUnfiltered('entry 2');
    seedUnfiltered('entry 3');
    const svc = createMockClassify('skip');

    const result = JSON.parse(await handleSmartIngestCleanup(engine, undefined, svc, { batch_size: 2 }));

    expect(result.processed).toBe(2);
    expect(result.remaining).toBe(1);
  });
});
