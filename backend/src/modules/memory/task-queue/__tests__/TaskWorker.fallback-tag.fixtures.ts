/**
 * Shared fixtures for the fallbackTagExtraction suites (SA4E-337 Fix #5, Bug #5).
 * (Split from TaskWorker.fallback-tag.test.ts — BR-18 ≤200 lines/file.)
 *
 * The worker is constructed WITHOUT a TagAnalyzer, which is exactly the LLM-down
 * branch: processTagEnrichment() → fallbackTagExtraction() (TaskWorker.ts).
 * Real in-memory SQLite is used so the SQL race guard (F4) is exercised for real.
 */
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../SqliteDbAdapter.js';
import { MemoryEngine } from '../../engine/index.js';
import { MEMORY_SCHEMA } from '../../schema/index.js';
import { PendingTaskRepository } from '../PendingTaskRepository.js';
import { TaskType } from '../models.js';
import { TaskWorker } from '../TaskWorker.js';
import pino from 'pino';

export const logger = pino({ level: 'silent' });

export const PENDING_TASKS_SCHEMA = `
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
`;

/** Fresh in-memory DB + engine with the migration-007 enrichment columns. */
export async function setupFallbackDb(
  session: string,
): Promise<{ db: SqliteAdapter; adapter: SqliteDbAdapter; engine: MemoryEngine }> {
  const db = new SqliteAdapter(':memory:');
  await db.connect();
  await db.exec(MEMORY_SCHEMA);
  await db.exec(PENDING_TASKS_SCHEMA);
  // Migration 007 columns (worker race guard F4 depends on them)
  await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'pending'`);
  await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enriched_by TEXT DEFAULT NULL`);
  await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enriched_at TEXT DEFAULT NULL`);
  const adapter = new SqliteDbAdapter(db as any);
  const engine = new MemoryEngine(adapter);
  engine.startSession(session);
  return { db, adapter, engine };
}

/** Run one TAG_ENRICHMENT task through the no-LLM fallback branch. */
export async function runFallback(
  db: SqliteAdapter,
  engine: MemoryEngine,
  entryId: number,
  payload: Record<string, unknown>,
): Promise<{ tags: string; enrichment_status: string | null; enriched_by: string | null; taskStatus: string }> {
  const adapter = new SqliteDbAdapter(db as any);
  const worker = new TaskWorker(adapter, engine, logger); // no setTagAnalyzer → fallback branch
  const repo = new PendingTaskRepository(adapter);
  const taskId = await repo.create({ task_type: TaskType.TAG_ENRICHMENT, entry_id: entryId, payload });
  const task = await repo.findById(taskId);
  await (worker as any).processTagEnrichment(task!, JSON.parse(task!.payload));

  const entry = await engine.findById(entryId);
  const row = db.get<{ enrichment_status: string | null; enriched_by: string | null }>(
    'SELECT enrichment_status, enriched_by FROM knowledge_entries WHERE id = ?', [entryId],
  );
  const taskRow = db.get<{ status: string }>('SELECT status FROM pending_tasks WHERE id = ?', [taskId]);
  return {
    tags: entry!.tags ?? '',
    enrichment_status: row?.enrichment_status ?? null,
    enriched_by: row?.enriched_by ?? null,
    taskStatus: taskRow?.status,
  };
}
