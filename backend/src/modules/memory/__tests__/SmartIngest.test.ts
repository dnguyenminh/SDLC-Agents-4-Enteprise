/**
 * Unit Tests — Smart Ingest Handler (SA4E-38)
 * Covers: handleSmartIngest, handleSmartIngestCleanup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteDbAdapter } from '../task-queue/SqliteDbAdapter.js';
import { MemoryEngine } from '../engine/index.js';
import { MEMORY_SCHEMA } from '../schema/index.js';
import { handleSmartIngest, handleSmartIngestCleanup } from '../dispatchers/smart-ingest.js';
import type { ClassifyService } from '../llm/classify-service.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(MEMORY_SCHEMA);
  return db;
}

function createMockClassify(verdict: 'ingest' | 'skip', summary?: string, available = true) {
  return {
    classify: vi.fn().mockResolvedValue({ verdict, summary }),
    isAvailable: vi.fn().mockResolvedValue(available),
    buildPrompt: vi.fn(),
    parseResponse: vi.fn(),
  } as unknown as ClassifyService;
}

function createUnavailableClassify() {
  return {
    classify: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(false),
    buildPrompt: vi.fn(),
    parseResponse: vi.fn(),
  } as unknown as ClassifyService;
}

describe('handleSmartIngest', () => {
  let db: Database.Database;
  let engine: MemoryEngine;

  beforeEach(() => {
    db = createTestDb();
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

    const entries = db.prepare("SELECT * FROM knowledge_entries WHERE tags LIKE '%smart-ingest%'").all() as any[];
    expect(entries.length).toBe(1);
    expect(entries[0].tags).toContain('smart-ingest');
    expect(entries[0].source).toBe('/chat-prompt');
    expect(entries[0].user_id).toBe('user-1');
  });

  it('stores unfiltered entry with unfiltered tag', async () => {
    const svc = createUnavailableClassify();
    await handleSmartIngest(engine, { userId: 'user-1' }, svc, { message: 'some content' });

    const entries = db.prepare("SELECT * FROM knowledge_entries WHERE tags LIKE '%unfiltered%'").all() as any[];
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

describe('handleSmartIngestCleanup', () => {
  let db: Database.Database;
  let engine: MemoryEngine;

  beforeEach(() => {
    db = createTestDb();
    engine = new MemoryEngine(new SqliteDbAdapter(db));
    engine.startSession('test');
  });

  function seedUnfiltered(content: string): number {
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
    const id = seedUnfiltered('test entry');
    const svc = createMockClassify('skip');

    const result = JSON.parse(await handleSmartIngestCleanup(engine, undefined, svc, { dry_run: true }));

    expect(result.processed).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.dry_run).toBe(true);
    // Entry should still exist
    const entry = engine.findById(id);
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
