/**
 * Migration 003: Create pending_tasks table.
 * Cross-engine: PostgreSQL + SQLite compatible.
 * Table-existence check branches on adapter engine (no probe-then-fallback).
 * DDL kept in the original cross-engine form (SERIAL tolerated by SQLite).
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

export async function migrate003PendingTasks(db: DatabaseAdapter): Promise<void> {
  // Check table existence on the right catalog for the active engine.
  let exists = false;
  try {
    if (db.getEngine() === 'postgresql') {
      const pg = await db.allAsync<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
        ['pending_tasks'],
      );
      exists = pg.length > 0;
    } else {
      const lite = await db.allAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='pending_tasks'`,
      );
      exists = lite.length > 0;
    }
  } catch (err) {
    console.debug('[migration-003] table introspection failed:', (err as Error).message);
  }

  if (exists) {
    console.debug('[migration-003] pending_tasks table already exists, skipping');
    return;
  }

  await db.execAsync(`
    CREATE TABLE pending_tasks (
      id SERIAL PRIMARY KEY,
      task_type TEXT NOT NULL,
      entry_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      payload TEXT NOT NULL,
      error TEXT,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT current_timestamp,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT,
      claimed_at TEXT,
      dead_lettered_at TEXT,
      FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id)
    )
  `);
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_pending_tasks_status_created ON pending_tasks(status, created_at)`); } catch (err) { console.debug('[migration] DDL statement failed (expected if already applied):', (err as Error).message); }
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_pending_tasks_entry_id ON pending_tasks(entry_id)`); } catch (err) { console.debug('[migration] DDL statement failed (expected if already applied):', (err as Error).message); }
  // Rename legacy CODE_SUMMARY → CODE_ENRICHMENT (idempotent)
  try { await db.execAsync(`UPDATE pending_tasks SET task_type = 'CODE_ENRICHMENT' WHERE task_type = 'CODE_SUMMARY'`); } catch (err) { console.debug('[migration] CODE_SUMMARY rename failed (non-fatal):', (err as Error).message); }
}
