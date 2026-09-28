/**
 * Migration 008: Heal pending_tasks column drift (SA4E-6 follow-up).
 *
 * Root cause: migration 003 only creates the FULL pending_tasks schema for NEW
 * databases (it early-returns when the table already exists). Databases created
 * by an older 003 are missing columns the current code relies on — notably
 * `priority` (used in claimBatch/claimNext ORDER BY), which caused:
 *   column "priority" does not exist  (PostgreSQL 42703)
 *
 * This migration idempotently ADDs the drifted columns so existing tables
 * self-heal at startup. Cross-engine (PostgreSQL + SQLite).
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

/** Columns that may be missing on pre-drift pending_tasks tables. */
const DRIFT_COLUMNS: Array<{ name: string; type: string }> = [
  { name: 'priority', type: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'error_message', type: 'TEXT DEFAULT NULL' },
  { name: 'updated_at', type: 'TEXT DEFAULT NULL' },
  { name: 'claimed_at', type: 'TEXT DEFAULT NULL' },
  { name: 'completed_at', type: 'TEXT DEFAULT NULL' },
  { name: 'dead_lettered_at', type: 'TEXT DEFAULT NULL' },
];

/**
 * Add a single column idempotently across engines.
 * PostgreSQL supports ADD COLUMN IF NOT EXISTS; SQLite does not, so we
 * tolerate the "duplicate column" error instead.
 */
async function addColumnIfMissing(
  db: DatabaseAdapter, engine: string, name: string, type: string,
): Promise<void> {
  if (engine === 'postgresql') {
    await db.execAsync(`ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS ${name} ${type}`);
    return;
  }
  try {
    await db.execAsync(`ALTER TABLE pending_tasks ADD COLUMN ${name} ${type}`);
  } catch (err) {
    const msg = (err as Error).message || '';
    // SQLite: column already present — safe to ignore. Anything else propagates.
    if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw err;
  }
}

export async function migrate008PendingTasksDriftColumns(db: DatabaseAdapter): Promise<void> {
  // Table may not exist yet on a brand-new DB — migration 003 handles creation,
  // so per-column failures are logged and skipped rather than thrown.
  const engine = db.getEngine();
  for (const col of DRIFT_COLUMNS) {
    try {
      await addColumnIfMissing(db, engine, col.name, col.type);
    } catch (err) {
      // Non-fatal per column: log and continue so one failure can't block the rest.
      console.debug(`[migration-008] pending_tasks.${col.name} skipped:`, (err as Error).message);
    }
  }

  // Ensure the index the scheduler relies on for priority ordering exists.
  try {
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_pending_tasks_priority ON pending_tasks(priority)`);
  } catch (err) {
    console.debug('[migration-008] priority index skipped:', (err as Error).message);
  }
}
