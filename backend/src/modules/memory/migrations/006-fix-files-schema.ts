/**
 * Migration 006: Bring PostgreSQL `files` table schema in line with SQLite reference.
 *
 * The SQLite schema (see engine/db/schema.ts) and the indexer INSERT statement
 * (engine/indexer/indexing-engine.ts) expect these columns on `files`:
 *   - file_created_at TEXT
 *   - file_author     TEXT
 *   - file_version    TEXT
 *   - UNIQUE(project_id, path)   -- required for `ON CONFLICT (project_id, path)`
 *
 * When the DB was migrated/dumped from SQLite to PostgreSQL, these were dropped.
 * Symptom: "column file_created_at of relation files does not exist" (42703)
 * during Background full re-index.
 *
 * This migration adds the missing columns and unique index. Fully idempotent:
 * repeated runs are no-ops thanks to `IF NOT EXISTS` clauses.
 *
 * SQLite: no-op — canonical schema already covers all columns.
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';

const logger = pino({ name: 'migration-006' });

/** Columns that must exist on `files`. Kept in sync with SQLite schema.ts. */
const REQUIRED_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'file_created_at', ddl: 'TEXT' },
  { name: 'file_author',     ddl: 'TEXT' },
  { name: 'file_version',    ddl: 'TEXT' },
];

async function ensureColumn(
  db: DatabaseAdapter,
  column: string,
  ddl: string,
): Promise<void> {
  await db.execAsync(`ALTER TABLE files ADD COLUMN IF NOT EXISTS ${column} ${ddl}`);
}

/**
 * Ensure UNIQUE(project_id, path) exists so `ON CONFLICT (project_id, path)`
 * used by the indexer works. Uses a plain unique index (idempotent via IF NOT EXISTS).
 */
async function ensureProjectPathUnique(db: DatabaseAdapter): Promise<void> {
  await db.execAsync(
    `CREATE UNIQUE INDEX IF NOT EXISTS files_project_path_uidx ON files(project_id, path)`,
  );
}

export async function migrate006FixFilesSchema(db: DatabaseAdapter): Promise<void> {
  if (db.getEngine() !== 'postgresql') return;

  // Verify `files` exists before altering — fresh installs may not have it yet.
  const tbl = await db.allAsync<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'files'`,
  );
  if (tbl.length === 0) {
    logger.warn('migration-006: files table not present — skipping');
    return;
  }

  for (const { name, ddl } of REQUIRED_COLUMNS) {
    await ensureColumn(db, name, ddl);
  }
  await ensureProjectPathUnique(db);
  logger.info('migration-006: files schema aligned with SQLite reference');
}
