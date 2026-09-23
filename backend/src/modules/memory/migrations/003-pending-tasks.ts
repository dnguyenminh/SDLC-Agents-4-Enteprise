/**
 * Migration 003: Create pending_tasks table.
 * Cross-engine: PostgreSQL + SQLite compatible.
 * 
 * Note: pending_tasks table is now created by Knex migration 000.
 * This migration checks if table exists and skips if already present.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

export async function migrate003PendingTasks(db: DatabaseAdapter): Promise<void> {
  // Check table existence using SQLite directly (no PG introspection needed)
  let exists = false;
  try {
    const lite = await db.allAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='pending_tasks'`,
    );
    exists = lite.length > 0;
  } catch (err) {
    console.debug('[migration-003] SQLite table introspection failed:', (err as Error).message);
  }

  if (exists) {
    console.debug('[migration-003] pending_tasks table already exists, skipping');
    return;
  }

  await db.execAsync(`
    CREATE TABLE pending_tasks (
      id INTEGER PRIMARY KEY,
      task_type TEXT NOT NULL,
      entry_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT NOT NULL,
      error TEXT,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      priority INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT,
      claimed_at TEXT,
      dead_lettered_at TEXT,
      FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
    )
  `);
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_pending_tasks_status_created ON pending_tasks(status, created_at)`); } catch (err) { console.debug('[migration] DDL statement failed:', (err as Error).message); }
  try { await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_pending_tasks_entry_id ON pending_tasks(entry_id)`); } catch (err) { console.debug('[migration] DDL statement failed:', (err as Error).message); }
}