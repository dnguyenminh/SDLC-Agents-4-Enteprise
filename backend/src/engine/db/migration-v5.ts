/**
 * SA4E-41 Migration V5 — Multi-tenant isolation for Code Intelligence.
 *
 * Adds `project_id` to files/symbols/modules/embeddings/relationships/body_embeddings.
 * - files/modules are RECREATED (composite UNIQUE constraint change).
 * - symbols/embeddings/relationships/body_embeddings use additive ALTER ADD COLUMN.
 * Idempotent: each step checks pragma_table_info before acting.
 * SA4E-53: Uses QueryDatabaseAdapter instead of raw better-sqlite3.
 */

import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';

const logger = pino({ name: 'migration-v5' });

/** Get set of column names for a table via pragma_table_info. */
async function columns(db: QueryDatabaseAdapter, table: string): Promise<Set<string>> {
  const rows = await db.allAsync<{ name: string }>(`PRAGMA table_info('${table}')`);
  return new Set(rows.map(r => r.name));
}

async function hasProjectId(db: QueryDatabaseAdapter, table: string): Promise<boolean> {
  return (await columns(db, table)).has('project_id');
}

/** Recreate `files` with UNIQUE(project_id, path); preserves id for FK integrity. */
async function recreateFiles(db: QueryDatabaseAdapter, legacyProjectId: string): Promise<void> {
  const cols = await columns(db, 'files');
  if (cols.has('project_id')) return;

  await db.execAsync(`CREATE TABLE files_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    path TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    language TEXT NOT NULL,
    module TEXT,
    content_hash TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    last_indexed TEXT NOT NULL DEFAULT (datetime('now')),
    line_count INTEGER NOT NULL DEFAULT 0,
    file_created_at TEXT,
    file_author TEXT,
    file_version TEXT,
    UNIQUE(project_id, path)
  );`);
  // Copy existing data, map columns if present
  if (cols.has('project_id') && cols.has('file_created_at')) {
    await db.runAsync(
      `INSERT INTO files_new (id, project_id, path, relative_path, language, module,
          content_hash, size_bytes, last_indexed, line_count, file_created_at, file_author, file_version)
        SELECT id, project_id, path, relative_path, language, module,
          content_hash, size_bytes, last_indexed, line_count, file_created_at, file_author, file_version FROM files`,
    );
  } else if (cols.has('project_id')) {
    await db.runAsync(
      `INSERT INTO files_new (id, project_id, path, relative_path, language, module,
          content_hash, size_bytes, last_indexed, line_count, file_created_at, file_author, file_version)
        SELECT id, project_id, path, relative_path, language, module,
          content_hash, size_bytes, last_indexed, line_count, NULL, NULL, NULL FROM files`,
    );
  } else {
    await db.runAsync(
      `INSERT INTO files_new (id, project_id, path, relative_path, language, module,
          content_hash, size_bytes, last_indexed, line_count, file_created_at, file_author, file_version)
        SELECT id, ?, path, relative_path, language, module,
          content_hash, size_bytes, last_indexed, line_count, NULL, NULL, NULL FROM files`,
      [legacyProjectId],
    );
  }
  await db.execAsync('DROP TABLE files; ALTER TABLE files_new RENAME TO files;');
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_files_path ON files(relative_path);
    CREATE INDEX IF NOT EXISTS idx_files_module ON files(module);
    CREATE INDEX IF NOT EXISTS idx_files_language ON files(language);`);
}

/** Recreate `modules` with UNIQUE(project_id, name); preserves all pattern columns. */
async function recreateModules(db: QueryDatabaseAdapter, legacyProjectId: string): Promise<void> {
  if (await hasProjectId(db, 'modules')) return;
  await db.execAsync(`CREATE TABLE modules_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL,
    language TEXT,
    description TEXT,
    file_count INTEGER NOT NULL DEFAULT 0,
    symbol_count INTEGER NOT NULL DEFAULT 0,
    di_style TEXT DEFAULT NULL,
    error_handling TEXT DEFAULT NULL,
    naming_convention TEXT DEFAULT NULL,
    logging_framework TEXT DEFAULT NULL,
    testing_framework TEXT DEFAULT NULL,
    purpose TEXT DEFAULT NULL,
    UNIQUE(project_id, name)
  );`);
  await db.runAsync(
    `INSERT INTO modules_new (id, project_id, name, root_path, language, description,
        file_count, symbol_count, di_style, error_handling, naming_convention,
        logging_framework, testing_framework, purpose)
      SELECT id, ?, name, root_path, language, description,
        file_count, symbol_count, di_style, error_handling, naming_convention,
        logging_framework, testing_framework, purpose FROM modules`,
    [legacyProjectId],
  );
  await db.execAsync('DROP TABLE modules; ALTER TABLE modules_new RENAME TO modules;');
}

/** Additively add project_id to a table (FTS-safe for symbols). */
async function addProjectIdColumn(db: QueryDatabaseAdapter, table: string): Promise<void> {
  if (await hasProjectId(db, table)) return;
  await db.execAsync(`ALTER TABLE ${table} ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
}

/** Backfill scope from each row's parent; orphans fall back to legacyProjectId. */
async function backfillScopes(db: QueryDatabaseAdapter, legacy: string): Promise<void> {
  await db.runAsync(
    `UPDATE symbols SET project_id =
      COALESCE((SELECT f.project_id FROM files f WHERE f.id = symbols.file_id), ?)
    WHERE project_id = ''`,
    [legacy],
  );
  await db.runAsync(
    `UPDATE relationships SET project_id =
      COALESCE((SELECT s.project_id FROM symbols s WHERE s.id = relationships.source_symbol_id), ?)
    WHERE project_id = ''`,
    [legacy],
  );
  await db.runAsync(
    `UPDATE body_embeddings SET project_id =
      COALESCE((SELECT s.project_id FROM symbols s WHERE s.id = body_embeddings.symbol_id), ?)
    WHERE project_id = ''`,
    [legacy],
  );
  await db.runAsync(
    `UPDATE embeddings SET project_id = COALESCE(
      (SELECT s.project_id FROM symbols s WHERE s.id = embeddings.symbol_id),
      (SELECT f.project_id FROM files f WHERE f.id = embeddings.file_id), ?)
    WHERE project_id = ''`,
    [legacy],
  );
}

/** Create per-tenant scope indexes (idempotent). */
async function createScopeIndexes(db: QueryDatabaseAdapter): Promise<void> {
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_symbols_project    ON symbols(project_id);
    CREATE INDEX IF NOT EXISTS idx_symbols_proj_kind  ON symbols(project_id, kind);
    CREATE INDEX IF NOT EXISTS idx_files_project      ON files(project_id);
    CREATE INDEX IF NOT EXISTS idx_modules_project    ON modules(project_id);
    CREATE INDEX IF NOT EXISTS idx_rel_project        ON relationships(project_id);`);
}

/**
 * Apply V5 multi-tenant migration. `legacyProjectId` is the booting workspace's
 * derived project id; existing rows are backfilled to it. Idempotent + fail-safe.
 */
export async function applyMigrationV5(db: QueryDatabaseAdapter, legacyProjectId: string): Promise<void> {
  const legacy = legacyProjectId || 'default';
  try {
    await db.execAsync('PRAGMA foreign_keys=OFF;');
    await recreateFiles(db, legacy);
    await recreateModules(db, legacy);
    for (const t of ['symbols', 'embeddings', 'relationships', 'body_embeddings']) {
      await addProjectIdColumn(db, t);
    }
    await backfillScopes(db, legacy);
    await createScopeIndexes(db);
    await db.runAsync('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [5]);
    logger.info(`[migrations] V5: multi-tenant project_id applied (legacy=${legacy})`);
  } catch (err) {
    logger.error({ err }, '[migrations] V5 error:');
    throw err;
  } finally {
    await db.execAsync('PRAGMA foreign_keys=ON;');
  }
}
