/**
 * Unit Tests — Smart Ingest Handler (SA4E-38): handleSmartIngest.
 * (Split from SmartIngest.test.ts — BR-18 ≤200 lines/file.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../task-queue/SqliteDbAdapter.js';
import { MemoryEngine } from '../engine/index.js';
import { handleSmartIngest } from '../dispatchers/smart-ingest.js';
import type { ClassifyService } from '../llm/classify-service.js';
import { createMockClassify, createTestDb, createUnavailableClassify } from './SmartIngest.fixtures.js';

describe('handleSmartIngest', () => {
  let db: SqliteAdapter;
  let engine: MemoryEngine;

  beforeEach(async () => {
    db = await createTestDb();
    engine = new MemoryEngine(new SqliteDbAdapter(db));
    engine.startSession('test');
  });

  it('skips empty message', async () => {
    const svc = createMockClassify('ingest', 'test');
    const result = JSON.parse(await handleSmartIngest(engine, undefined, svc, { message: '' }));

    expect(result.action).toBe('skip');
    expect(result.reason).toBe('empty_message');
  });

  it('skips null message', async () => {
    const svc = createMockClassify('ingest', 'test');
    const result = JSON.parse(await handleSmartIngest(engine, undefined, svc, {}));

    expect(result.action).toBe('skip');
    expect(result.reason).toBe('empty_message');
  });

  it('falls back to unfiltered when LLM unavailable', async () => {
    const svc = createUnavailableClassify();
    const result = JSON.parse(await handleSmartIngest(engine, undefined, svc, { message: 'test content' }));

    expect(result.action).toBe('ingest_unfiltered');
    expect(result.reason).toBe('llm_unavailable');
  });

  it('falls back to unfiltered when classifyService is undefined', async () => {
    const result = JSON.parse(await handleSmartIngest(engine, undefined, undefined, { message: 'test content' }));

    expect(result.action).toBe('ingest_unfiltered');
    expect(result.reason).toBe('llm_unavailable');
  });

  it('ingests when LLM says ingest', async () => {
    const svc = createMockClassify('ingest', 'Architecture decision: use Strategy pattern');
    const result = JSON.parse(await handleSmartIngest(engine, undefined, svc, { message: 'We decided to use Strategy' }));

    expect(result.action).toBe('ingest');
    expect(result.summary).toBe('Architecture decision: use Strategy pattern');
  });

  it('skips when LLM says skip', async () => {
    const svc = createMockClassify('skip');
    const result = JSON.parse(await handleSmartIngest(engine, undefined, svc, { message: 'hello there' }));

    expect(result.action).toBe('skip');
    expect(result.reason).toBe('no business/technical value');
  });

  it('skips duplicate content', async () => {
    const summary = 'Architecture decision';
    // Pre-insert matching entry
    engine.insert({
      content: summary,
      summary,
      type: 'CONTEXT',
      source: '/chat-prompt',
      tags: 'smart-ingest',
    });

    const svc = createMockClassify('ingest', summary);
    const result = JSON.parse(await handleSmartIngest(engine, undefined, svc, { message: 'test' }));

    expect(result.action).toBe('skip');
    expect(result.reason).toBe('duplicate');
  });

  it('truncates message to 10000 chars', async () => {
    const longMessage = 'A'.repeat(15000);
    const svc = createMockClassify('ingest', 'summary');
    await handleSmartIngest(engine, undefined, svc, { message: longMessage });

    expect(svc.classify).toHaveBeenCalledWith('A'.repeat(10000));
  });

  it('falls back on parse error', async () => {
    const svc = {
      classify: vi.fn().mockRejectedValue(new Error('llm_parse_error')),
      isAvailable: vi.fn().mockResolvedValue(true),
      buildPrompt: vi.fn(),
      parseResponse: vi.fn(),
    } as unknown as ClassifyService;

    const result = JSON.parse(await handleSmartIngest(engine, undefined, svc, { message: 'test content' }));

    expect(result.action).toBe('ingest_unfiltered');
    expect(result.reason).toBe('llm_parse_error');
  });

  it('stores entry with correct tags on ingest', async () => {
    const svc = createMockClassify('ingest', 'Important knowledge');
    await handleSmartIngest(engine, { userId: 'user-1' }, svc, { message: 'test' });

    const entries = await db.all<any>("SELECT * FROM knowledge_entries WHERE tags LIKE '%smart-ingest%'");
    expect(entries.length).toBe(1);
    expect(entries[0].tags).toContain('smart-ingest');
    expect(entries[0].source).toBe('/chat-prompt');
    expect(entries[0].user_id).toBe('user-1');
  });

  it('stores unfiltered entry with unfiltered tag', async () => {
    const svc = createUnavailableClassify();
    await handleSmartIngest(engine, { userId: 'user-1' }, svc, { message: 'some content' });

    const entries = await db.all<any>("SELECT * FROM knowledge_entries WHERE tags LIKE '%unfiltered%'");
    expect(entries.length).toBe(1);
    expect(entries[0].tags).toContain('unfiltered');
  });

  it('never throws — returns error JSON on unexpected failure', async () => {
    // Force an error by making engine.insert throw
    const badEngine = { ...engine, insert: () => { throw new Error('DB error'); } } as any;
    badEngine.getDb = () => db;
    const svc = createMockClassify('ingest', 'test');

    const result = JSON.parse(await handleSmartIngest(badEngine, undefined, svc, { message: 'test' }));
    expect(result.action).toBe('error');
    expect(result.reason).toBe('ingest_failed');
  });
});
