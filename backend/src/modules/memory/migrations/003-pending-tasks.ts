/**
 * Migration 003: Create pending_tasks table.
 * SA4E-44 — Persistent task queue for KB ingest enrichment.
 * Cross-engine compatible SQL (no RETURNING, no engine-specific features).
 */

import type Database from 'better-sqlite3';

export function migrate003PendingTasks(db: Database.Database): void {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='pending_tasks'",
  ).all();

  if (tables.length > 0) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_tasks (
      id INTEGER PRIMARY KEY,
      task_type TEXT NOT NULL,
      entry_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      payload TEXT NOT NULL,
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id)
    );

    CREATE INDEX IF NOT EXISTS idx_pending_tasks_status_created
      ON pending_tasks(status, created_at);

    CREATE INDEX IF NOT EXISTS idx_pending_tasks_entry_id
      ON pending_tasks(entry_id);
  `);
}
