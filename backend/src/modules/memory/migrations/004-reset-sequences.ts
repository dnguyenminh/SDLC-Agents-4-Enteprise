/**
 * Migration 004: Reset PostgreSQL sequences to avoid duplicate key errors.
 * When data was previously inserted with explicit id values (e.g. migrated from SQLite),
 * the SERIAL sequences may be out of sync with actual max id values.
 * This migration resets all affected sequences to max(id) + 1.
 * Safe to run multiple times (idempotent). SQLite: no-op.
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';

const logger = pino({ name: 'migration-004' });

/** Tables with SERIAL primary keys that may have sequence drift. */
const SERIAL_TABLES = [
  'memory_sessions',
  'memory_audit',
  'conversation_turns',
  'knowledge_entries',
  'knowledge_vectors',
  'knowledge_graph_edges',
  'consolidation_log',
  'citations',
  'search_log',
  'entry_outcomes',
  'pending_tasks',
] as const;

export async function migrate004ResetSequences(db: DatabaseAdapter): Promise<void> {
  // Only needed for PostgreSQL — detect by trying pg_get_serial_sequence
  let isPostgres = false;
  try {
    await db.allAsync(`SELECT 1 FROM information_schema.tables LIMIT 1`);
    isPostgres = true;
  } catch { return; } // SQLite — skip

  if (!isPostgres) return;

  for (const table of SERIAL_TABLES) {
    try {
      // Check table exists
      const exists = await db.allAsync<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
        [table],
      );
      if (exists.length === 0) continue;

      // Get sequence name for the id column
      const seqRow = await db.getAsync<{ seq: string }>(
        `SELECT pg_get_serial_sequence($1, 'id') as seq`,
        [table],
      );
      if (!seqRow?.seq) continue;

      // Reset to max(id) + 1
      await db.execAsync(
        `SELECT setval('${seqRow.seq}', COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`,
      );
      logger.info({ table, seq: seqRow.seq }, 'migration-004: sequence reset');
    } catch (err) {
      logger.warn({ table, err }, 'migration-004: could not reset sequence (non-fatal)');
    }
  }
}
