/**
 * UT-12: loadPreviousContext — SQL query behavior
 * Unit tests for TaskWorker.loadPreviousContext with mocked engine.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskWorker } from '../TaskWorker.js';
import type { DatabaseAdapter } from '../../../../database/adapters/DatabaseAdapter.js';
import type { MemoryEngine } from '../../engine/index.js';
import pino from 'pino';

function createMockDb(): DatabaseAdapter {
  return {
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(),
    transaction: vi.fn((fn: any) => fn()),
  } as unknown as DatabaseAdapter;
}

function createMockEngine(entries: Map<number, any>): MemoryEngine {
  const engine = {
    findById: vi.fn((id: number) => entries.get(id)),
    updateTags: vi.fn(),
    updateStructuredMap: vi.fn(),
    getDb: vi.fn(() => ({
      prepare: vi.fn(() => ({
        get: vi.fn(),
        run: vi.fn(),
      })),
    })),
  } as unknown as MemoryEngine;
  return engine;
}

const logger = pino({ level: 'silent' });
const testConfig = {
  enableContextChain: true,
  contextChainMaxLength: 500,
  structuredMapMaxSize: 102400,
};

describe('UT-12: loadPreviousContext', () => {
  let engine: MemoryEngine;
  let entries: Map<number, any>;
  let db: DatabaseAdapter;

  beforeEach(() => {
    entries = new Map();
    engine = createMockEngine(entries);
    db = createMockDb();
  });

  function createWorker(): TaskWorker {
    const worker = new TaskWorker(db, engine, logger, testConfig);
    return worker;
  }

  it('returns context when previous entry has structured_map with summary', async () => {
    entries.set(1, {
      id: 1,
      structured_map: JSON.stringify({
        summary: 'Auth flow description',
        business_entities: ['User'],
        actors: ['Admin'],
      }),
    });
    // Mock getDb().prepare().get() to return entry 1
    const mockGet = vi.fn().mockReturnValue({ id: 1, structured_map: entries.get(1).structured_map });
    const mockPrepare = vi.fn().mockReturnValue({ get: mockGet });
    (engine as any).getDb.mockReturnValue({ prepare: mockPrepare });

    const worker = createWorker();
    const result = await (worker as any).loadPreviousContext(2, '/doc.md');

    expect(result).not.toBeNull();
    expect(result.previous_section_id).toBe(1);
    expect(result.summary).toBe('Auth flow description');
    expect(result.business_entities).toEqual(['User']);
    expect(result.actors).toEqual(['Admin']);
  });

  it('returns null for first section (no previous entry)', async () => {
    const mockGet = vi.fn().mockReturnValue(null);
    const mockPrepare = vi.fn().mockReturnValue({ get: mockGet });
    (engine as any).getDb.mockReturnValue({ prepare: mockPrepare });

    const worker = createWorker();
    const result = await (worker as any).loadPreviousContext(1, '/doc.md');
    expect(result).toBeNull();
  });

  it('returns null when source is null (single ingest)', async () => {
    const worker = createWorker();
    const result = await (worker as any).loadPreviousContext(1, null);
    expect(result).toBeNull();
  });

  it('returns null when previous entry has empty structured_map', async () => {
    entries.set(1, { id: 1, structured_map: '{}' });
    const mockGet = vi.fn().mockReturnValue({ id: 1, structured_map: '{}' });
    const mockPrepare = vi.fn().mockReturnValue({ get: mockGet });
    (engine as any).getDb.mockReturnValue({ prepare: mockPrepare });

    const worker = createWorker();
    const result = await (worker as any).loadPreviousContext(2, '/doc.md');
    expect(result).toBeNull();
  });

  it('returns null when previous entry has no summary', async () => {
    entries.set(1, {
      id: 1,
      structured_map: JSON.stringify({ tags: ['error-pattern'], extraction_meta: { fallback_used: true } }),
    });
    const mockGet = vi.fn().mockReturnValue({ id: 1, structured_map: entries.get(1).structured_map });
    const mockPrepare = vi.fn().mockReturnValue({ get: mockGet });
    (engine as any).getDb.mockReturnValue({ prepare: mockPrepare });

    const worker = createWorker();
    const result = await (worker as any).loadPreviousContext(2, '/doc.md');
    expect(result).toBeNull();
  });

  it('returns null on DB error', async () => {
    const mockPrepare = vi.fn(() => { throw new Error('DB error'); });
    (engine as any).getDb.mockReturnValue({ prepare: mockPrepare });

    const worker = createWorker();
    const result = await (worker as any).loadPreviousContext(2, '/doc.md');
    expect(result).toBeNull();
  });
});
