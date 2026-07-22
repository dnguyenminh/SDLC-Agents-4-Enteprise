/**
 * Migration 003: Create pending_tasks table.
 * Cross-engine: PostgreSQL + SQLite compatible.
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

export async function migrate003PendingTasks(db: DatabaseAdapter): Promise<void> {
  // Check table existence cross-engine
  let exists = false;
  try {
    const pg = await db.allAsync<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
      ['pending_tasks'],
    );
    exists = pg.length > 0;
  } catch {
    try {
      const lite = await db.allAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='pending_tasks'`,
      );
      exists = lite.length > 0;
    } catch {}
  }

  if (exists) return;

  await db.execAsync(`
    CREATE TABLE pending_tasks (
      id SERIAL PRIMARY KEY,
      task_type TEXT NOT NULL,
      entry_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      payload TEXT NOT NULL,
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL DEFAULT current_timestamp,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id)
    )
  `);
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_pending_tasks_status_created ON pending_tasks(status, created_at)`); } catch {}
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_pending_tasks_entry_id ON pending_tasks(entry_id)`); } catch {}
}
