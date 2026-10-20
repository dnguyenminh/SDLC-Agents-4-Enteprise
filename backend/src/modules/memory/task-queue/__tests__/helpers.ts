/**
 * Shared fixtures for TaskWorker integration tests (IT-01..IT-07).
 * In-memory SQLite + mocked LLM. See TaskWorker.it-*.test.ts files.
 */
import { vi } from 'vitest';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../SqliteDbAdapter.js';
import { MemoryEngine } from '../../engine/index.js';
import { MEMORY_SCHEMA } from '../../schema/index.js';
import { TaskWorker } from '../TaskWorker.js';
import { TagAnalyzerService } from '../../llm/analyzer.js';
import { LLMService } from '../../llm/LLMService.js';
import type { DatabaseAdapter } from '../../../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';

export const logger = pino({ level: 'silent' });

const PENDING_TASKS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS pending_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL,
    entry_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payload TEXT NOT NULL,
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    project_id TEXT DEFAULT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id)
  );
  CREATE INDEX IF NOT EXISTS idx_pending_tasks_status_created ON pending_tasks(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_pending_tasks_entry_id ON pending_tasks(entry_id);
`;

async function createTestDb(): Promise<SqliteAdapter> {
  const db = new SqliteAdapter(':memory:');
  await db.connect();
  await db.exec(MEMORY_SCHEMA);
  await db.exec(PENDING_TASKS_SCHEMA);
  // SA4E-79: Apply enrichment status columns (migration 007)
  // Default to 'pending' in test context so TaskWorker processes them
  await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'pending'`);
  await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enriched_by TEXT DEFAULT NULL`);
  await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enriched_at TEXT DEFAULT NULL`);
  return db;
}

export const validFullResponse = JSON.stringify({
  tags: [{ tag: 'auth-flow-login', category: 'feature', confidence: 0.95, reason: 'auth flow' }],
  summary: 'Describes authentication flow.',
  business_entities: ['User', 'JWT Token'],
  actors: ['End User'],
  business_rules: ['JWT expires after 24h'],
});

export const testConfig = {
  baseInterval: 100,
  maxInterval: 1000,
  enableContextChain: true,
  contextChainMaxLength: 500,
  llmChunkSize: 6000,
  llmChunkOverlap: 200,
  structuredMapMaxSize: 102400,
};

/** Build the full TaskWorker harness: fresh in-memory DB + mocked LLM. */
export async function createWorkerHarness() {
  const db = await createTestDb();
  const adapter = new SqliteDbAdapter(db as any);
  const engine = new MemoryEngine(adapter);
  engine.startSession('test');
  const llm = new LLMService({ provider: 'ollama', model: 'test-model', maxTokens: 2048 });
  vi.spyOn(llm, 'complete').mockResolvedValue({
    content: validFullResponse,
    model: 'test-model',
    provider: 'ollama',
  });
  const analyzer = new TagAnalyzerService(llm);
  const worker = new TaskWorker(adapter, engine, logger, testConfig);
  worker.setTagAnalyzer(analyzer);
  (worker as any).llmService = llm; // set LLM service reference
  return { db, adapter, engine, llm, analyzer, worker };
}

export type WorkerHarness = Awaited<ReturnType<typeof createWorkerHarness>>;

/** Mock DB adapter for unit tests (no real SQLite). */
export function createMockDb(): DatabaseAdapter {
  return {
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(),
    transaction: vi.fn((fn: any) => fn()),
    getEngine: vi.fn(() => 'sqlite'),
    getAsync: vi.fn(),
    allAsync: vi.fn(() => Promise.resolve([])),
    runAsync: vi.fn(() => Promise.resolve({ changes: 0, lastInsertRowid: 0 })),
  } as unknown as DatabaseAdapter;
}

/** Mock MemoryEngine backed by an in-memory entries map (no real SQLite). */
export function createMockEngine(entries: Map<number, any>): MemoryEngine {
  const mockAdapter = {
    getAsync: vi.fn(),
    allAsync: vi.fn(() => Promise.resolve([])),
    runAsync: vi.fn(() => Promise.resolve({ changes: 0, lastInsertRowid: 0 })),
    getEngine: vi.fn(() => 'sqlite'),
  };
  const engine = {
    findById: vi.fn((id: number) => entries.get(id)),
    updateTags: vi.fn(),
    updateStructuredMap: vi.fn(),
    getAdapter: vi.fn(() => mockAdapter),
    getDb: vi.fn(() => ({
      prepare: vi.fn(() => ({
        get: vi.fn(),
        run: vi.fn(),
      })),
    })),
  } as unknown as MemoryEngine;
  return engine;
}
