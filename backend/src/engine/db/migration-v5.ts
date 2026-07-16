/**
 * SA4E-41 Migration V5 — Multi-tenant isolation for Code Intelligence.
 *
 * Adds `project_id` to files/symbols/modules/embeddings/relationships/body_embeddings.
 * - files/modules are RECREATED (composite UNIQUE constraint change).
 * - symbols/embeddings/relationships/body_embeddings use additive ALTER ADD COLUMN
 *   so the FTS5 external-content mapping (symbols_fts → symbols.id) is preserved.
 * Idempotent: each step checks PRAGMA table_info before acting.
 */

import type Database from 'better-sqlite3';
import pino from 'pino';

const logger = pino({ name: 'migration-v5' });

/** Get set of column names for a table via PRAGMA. */
function columns(db: Database.Database, table: string): Set<string> {
  const rows = db.pragma(`table_info(${table})`) as { name: string }[];
  return new Set(rows.map(r => r.name));
}

function hasProjectId(db: Database.Database, table: string): boolean {
  return columns(db, table).has('project_id');
}

/** Recreate `files` with UNIQUE(project_id, path); preserves id for FK integrity. */
function recreateFiles(db: Database.Database, legacyProjectId: string): void {
  if (hasProjectId(db, 'files')) return;
  db.exec(`CREATE TABLE files_new (
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
    UNIQUE(project_id, path)
  );`);
  db.prepare(`INSERT INTO files_new (id, project_id, path, relative_path, language, module,
      content_hash, size_bytes, last_indexed, line_count)
    SELECT id, ?, path, relative_path, language, module,
      content_hash, size_bytes, last_indexed, line_count FROM files`).run(legacyProjectId);
  db.exec('DROP TABLE files; ALTER TABLE files_new RENAME TO files;');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_files_path ON files(relative_path);
    CREATE INDEX IF NOT EXISTS idx_files_module ON files(module);
    CREATE INDEX IF NOT EXISTS idx_files_language ON files(language);`);
}

/** Recreate `modules` with UNIQUE(project_id, name); preserves all pattern columns. */
function recreateModules(db: Database.Database, legacyProjectId: string): void {
  if (hasProjectId(db, 'modules')) return;
  db.exec(`CREATE TABLE modules_new (
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
  db.prepare(`INSERT INTO modules_new (id, project_id, name, root_path, language, description,
      file_count, symbol_count, di_style, error_handling, naming_convention,
      logging_framework, testing_framework, purpose)
    SELECT id, ?, name, root_path, language, description,
      file_count, symbol_count, di_style, error_handling, naming_convention,
      logging_framework, testing_framework, purpose FROM modules`).run(legacyProjectId);
  db.exec('DROP TABLE modules; ALTER TABLE modules_new RENAME TO modules;');
}

/** Additively add project_id to a table (FTS-safe for symbols). */
function addProjectIdColumn(db: Database.Database, table: string): void {
  if (hasProjectId(db, table)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
}

/** Backfill scope from each row's parent; orphans fall back to legacyProjectId. */
function backfillScopes(db: Database.Database, legacy: string): void {
  db.prepare(`UPDATE symbols SET project_id =
      COALESCE((SELECT f.project_id FROM files f WHERE f.id = symbols.file_id), ?)
    WHERE project_id = ''`).run(legacy);
  db.prepare(`UPDATE relationships SET project_id =
      COALESCE((SELECT s.project_id FROM symbols s WHERE s.id = relationships.source_symbol_id), ?)
    WHERE project_id = ''`).run(legacy);
  db.prepare(`UPDATE body_embeddings SET project_id =
      COALESCE((SELECT s.project_id FROM symbols s WHERE s.id = body_embeddings.symbol_id), ?)
    WHERE project_id = ''`).run(legacy);
  db.prepare(`UPDATE embeddings SET project_id = COALESCE(
      (SELECT s.project_id FROM symbols s WHERE s.id = embeddings.symbol_id),
      (SELECT f.project_id FROM files f WHERE f.id = embeddings.file_id), ?)
    WHERE project_id = ''`).run(legacy);
}

/** Create per-tenant scope indexes (idempotent). */
function createScopeIndexes(db: Database.Database): void {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_symbols_project    ON symbols(project_id);
    CREATE INDEX IF NOT EXISTS idx_symbols_proj_kind  ON symbols(project_id, kind);
    CREATE INDEX IF NOT EXISTS idx_files_project      ON files(project_id);
    CREATE INDEX IF NOT EXISTS idx_modules_project    ON modules(project_id);
    CREATE INDEX IF NOT EXISTS idx_rel_project        ON relationships(project_id);`);
}

/**
 * Apply V5 multi-tenant migration. `legacyProjectId` is the booting workspace's
 * derived project id; existing rows are backfilled to it. Idempotent + fail-safe.
 */
export function applyMigrationV5(db: Database.Database, legacyProjectId: string): void {
  const legacy = legacyProjectId || 'default';
  try {
    db.exec('PRAGMA foreign_keys=OFF;');
    recreateFiles(db, legacy);
    recreateModules(db, legacy);
    for (const t of ['symbols', 'embeddings', 'relationships', 'body_embeddings']) {
      addProjectIdColumn(db, t);
    }
    backfillScopes(db, legacy);
    createScopeIndexes(db);
    db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(5);
    logger.info(`[migrations] V5: multi-tenant project_id applied (legacy=${legacy})`); // SEC-07: info, not error
  } catch (err) {
    logger.error({ err }, '[migrations] V5 error:');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys=ON;');
  }
}
