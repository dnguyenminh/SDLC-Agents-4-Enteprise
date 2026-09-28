/**
 * Migration 005: Fix pending_tasks.id when created without SERIAL default.
 *
 * When the PostgreSQL database was migrated/dumped from SQLite, the SERIAL
 * type on `pending_tasks.id` was not preserved — the column ended up as
 * TEXT/INTEGER without a sequence default, causing every INSERT to fail with
 * "null value in column id violates not-null constraint".
 *
 * This migration detects the broken schema and rebuilds the table with the
 * correct SERIAL primary key. Safe to run repeatedly (idempotent):
 * - If `id` already has a sequence default → no-op.
 * - If schema is broken → drop + recreate. Any orphaned pending rows are
 *   discarded (they never had valid ids anyway, so no data is lost).
 *
 * SQLite: no-op (SERIAL is created correctly there).
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';

const logger = pino({ name: 'migration-005' });

interface IdColumn {
  data_type: string;
  column_default: string | null;
}

/**
 * Detect whether pending_tasks.id already has a proper SERIAL/sequence default.
 * Returns null when the table or column does not exist yet.
 */
async function inspectPendingTasksId(db: DatabaseAdapter): Promise<IdColumn | null> {
  const rows = await db.allAsync<IdColumn>(
    `SELECT data_type, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'pending_tasks'
        AND column_name = 'id'`,
  );
  return rows[0] ?? null;
}

/** Recreate the pending_tasks table with the correct SERIAL primary key. */
async function rebuildPendingTasks(db: DatabaseAdapter): Promise<void> {
  await db.execAsync(`DROP TABLE IF EXISTS pending_tasks CASCADE`);
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

export async function migrate005FixPendingTasksSerial(db: DatabaseAdapter): Promise<void> {
  // SQLite tables are created correctly by 003 — skip.
  if (db.getEngine() !== 'postgresql') return;

  const idCol = await inspectPendingTasksId(db);
  if (!idCol) return; // table not created yet — 003 will handle it

  // Healthy schema: integer column with a sequence-backed default (e.g. nextval('..._id_seq'))
  const isHealthy = idCol.data_type === 'integer'
    && !!idCol.column_default
    && idCol.column_default.includes('nextval');
  if (isHealthy) return;

  logger.warn(
    { data_type: idCol.data_type, default: idCol.column_default },
    'migration-005: pending_tasks.id has broken schema — rebuilding table',
  );
  await rebuildPendingTasks(db);
  logger.info('migration-005: pending_tasks rebuilt with SERIAL primary key');
}
