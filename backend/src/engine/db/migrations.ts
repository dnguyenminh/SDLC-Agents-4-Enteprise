/**
 * Migration runner — sequential, versioned schema migrations.
 * Each migration is applied once and tracked in schema_version table.
 */

import Database from 'better-sqlite3';
import pino from 'pino';
import { SCHEMA_V1 } from './schema.js';
import { runGraphMigrationsSync } from '../database/migrator.js';
import { applyMigrationV5 } from './migration-v5.js';

const logger = pino({ name: 'migrations' });

function applyMemorySchema(db: Database.Database): void {
  try {
    db.exec(SCHEMA_V1);
  } catch (err) {
    logger.error({ err }, '[migrations] Memory schema error (graceful):');
  }
}

interface Migration {
  version: number;
  description: string;
  sql: string;
}

/** Pattern metadata columns added in V2. */
const MIGRATION_V2_COLUMNS = [
  'di_style',
  'error_handling',
  'naming_convention',
  'logging_framework',
  'testing_framework',
  'purpose',
] as const;

const MIGRATIONS: Migration[] = [
  { version: 1, description: 'Initial schema with FTS5', sql: SCHEMA_V1 },
];

/** Get current schema version from database. */
export function getCurrentVersion(db: Database.Database): number {
  try {
    const row = db.prepare(
      'SELECT MAX(version) as v FROM schema_version'
    ).get() as { v: number | null } | undefined;
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

/** Run all pending migrations sequentially. */
export function runMigrations(db: Database.Database, legacyProjectId: string = 'default'): void {
  // Idempotent memory schema execution
  applyMemorySchema(db);

  // SA4E-42 (PT-01): additive `server` column on mcp_tools. Idempotent (PRAGMA probe),
  // so it MUST run on every startup BEFORE the early-return below — existing v5 DBs
  // (left by SA4E-41) would otherwise skip it and crash on the scoped INSERT.
  migrateAddMcpToolsServerColumn(db);

  const current = getCurrentVersion(db);
  const pending = MIGRATIONS.filter(m => m.version > current);

  if (pending.length === 0 && current >= 5) {
    logger.error('[migrations] Schema up to date');
    return;
  }

  for (const migration of pending) {
    logger.error(`[migrations] Applying v${migration.version}: ${migration.description}`);
    applyMigration(db, migration);
  }

  // Always run V2 column migration (idempotent)
  if (current < 2) {
    applyMigrationV2(db);
  }

  // Run V3 graph migrations (KSA-145/153/169) — idempotent, SQLite synchronous execution
  if (current < 3) {
    try {
      runGraphMigrationsSync(db);
    } catch (err) {
      logger.error({ err }, '[migrations] V3 graph migration error (graceful):');
    }
  }

  // Run V4 memory table recreation
  if (current < 4) {
    applyMigrationV4(db);
  }

  // Run V5 multi-tenant isolation (SA4E-41) — idempotent, backfills legacyProjectId
  if (current < 5) {
    applyMigrationV5(db, legacyProjectId);
  }
}

/**
 * SA4E-42 — add the `server` scoping column to `mcp_tools` for existing DBs.
 * Uses a PRAGMA table_info probe (F-02) instead of a swallow-all catch, so a
 * genuine migration failure surfaces rather than being silently ignored.
 */
export function migrateAddMcpToolsServerColumn(db: Database.Database): void {
  const existing = getExistingColumns(db, 'mcp_tools');
  if (!existing.has('server')) {
    db.exec('ALTER TABLE mcp_tools ADD COLUMN server TEXT');
    logger.error('[migrations] SA4E-42: added mcp_tools.server column');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON mcp_tools(server)');
}

function applyMigrationV4(db: Database.Database): void {
  try {
    const memoryTables = [
      'knowledge_entries',
      'knowledge_vectors',
      'knowledge_graph_edges',
      'consolidation_log',
      'memory_sessions',
      'memory_audit',
      'conversation_turns',
      'entity_index',
      'agent_scope_config',
      'quality_scores',
      'tags',
      'entry_tags',
      'citations',
      'attachments',
      'templates',
      'feedback',
      'reminders',
      'search_log',
      'popular_queries',
      'knowledge_fts'
    ];

    db.exec('PRAGMA foreign_keys=OFF;');
    for (const table of memoryTables) {
      db.exec(`DROP TABLE IF EXISTS ${table};`);
    }
    db.exec('PRAGMA foreign_keys=ON;');

    // Re-apply memory schema to create the new tables
    applyMemorySchema(db);

    db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(4);
    logger.error('[migrations] V4: Memory tables dropped and recreated with full schema');
  } catch (err) {
    logger.error({ err }, `[migrations] V4 error:`);
  }
}

function applyMigration(db: Database.Database, migration: Migration): void {
  db.exec(migration.sql);
  db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version);
  logger.error(`[migrations] v${migration.version} applied`);
}

/** Migration V2 — Add pattern metadata columns to modules table. */
function applyMigrationV2(db: Database.Database): void {
  try {
    const existing = getExistingColumns(db, 'modules');
    let added = 0;

    for (const col of MIGRATION_V2_COLUMNS) {
      if (!existing.has(col)) {
        db.exec(`ALTER TABLE modules ADD COLUMN ${col} TEXT DEFAULT NULL`);
        added++;
      }
    }

    db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(2);
    logger.error(`[migrations] V2: Added ${added} pattern columns`);
  } catch (err) {
    logger.error({ err }, `[migrations] V2 error (graceful degradation):`);
  }
}

/** Get set of column names for a table via PRAGMA. */
function getExistingColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.pragma(`table_info(${table})`) as { name: string }[];
  return new Set(rows.map(r => r.name));
}

function applyGraphMigrationsSync(db: Database.Database): void {
  logger.error('[migrations] Running graph schema migrations (SQLite sync)...');
  
  // 1. Add enhanced columns to symbols
  const existing = getExistingColumns(db, 'symbols');
  let added = 0;
  for (const col of [
    { name: 'parameters', type: 'TEXT' },
    { name: 'return_type', type: 'TEXT' },
    { name: 'parent_symbol_id', type: 'INTEGER' },
    { name: 'decorators', type: 'TEXT' },
    { name: 'complexity', type: 'INTEGER' },
    { name: 'is_async', type: 'INTEGER DEFAULT 0' },
    { name: 'is_exported', type: 'INTEGER DEFAULT 0' },
    { name: 'doc_comment_full', type: 'TEXT' },
    { name: 'modifiers', type: 'TEXT' },
  ]) {
    if (!existing.has(col.name)) {
      try {
        db.exec(`ALTER TABLE symbols ADD COLUMN ${col.name} ${col.type}`);
        added++;
      } catch {
        // Column may already exist
      }
    }
  }

  if (added > 0) {
    logger.error(`[migrations] Added ${added} enhanced symbol columns`);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_sym_parent ON symbols(parent_symbol_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sym_exported ON symbols(is_exported)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sym_file_kind ON symbols(file_id, kind)');
    } catch {
      // Indexes may already exist
    }
  }

  // 2. Create relationships table
  db.exec(`
CREATE TABLE IF NOT EXISTS relationships (
    id INTEGER PRIMARY KEY,
    source_symbol_id INTEGER NOT NULL,
    target_symbol TEXT NOT NULL,
    target_symbol_id INTEGER,
    kind TEXT NOT NULL CHECK(kind IN ('calls','imports','inherits','implements','uses','decorates')),
    file_path TEXT NOT NULL,
    line INTEGER NOT NULL,
    metadata TEXT,
    FOREIGN KEY (source_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (target_symbol_id) REFERENCES symbols(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_rel_source_kind ON relationships(source_symbol_id, kind);
CREATE INDEX IF NOT EXISTS idx_rel_target_kind ON relationships(target_symbol, kind);
CREATE INDEX IF NOT EXISTS idx_rel_file ON relationships(file_path);
  `);
  logger.error('[migrations] Relationships table ready');

  // 3. Create file_index table
  db.exec(`
CREATE TABLE IF NOT EXISTS file_index (
    path TEXT PRIMARY KEY,
    mtime INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    last_indexed TEXT NOT NULL DEFAULT (datetime('now')),
    symbol_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_file_index_hash ON file_index(content_hash);
  `);
  logger.error('[migrations] File index table ready');

  // 4. Create graph_meta table
  db.exec(`
CREATE TABLE IF NOT EXISTS graph_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR IGNORE INTO graph_meta (key, value) VALUES ('schema_version', '3');
INSERT OR IGNORE INTO graph_meta (key, value) VALUES ('last_checkpoint', '');
INSERT OR IGNORE INTO graph_meta (key, value) VALUES ('total_nodes', '0');
INSERT OR IGNORE INTO graph_meta (key, value) VALUES ('total_edges', '0');
  `);
  logger.error('[migrations] Graph metadata table ready');

  // 5. Create body_embeddings table
  db.exec(`
CREATE TABLE IF NOT EXISTS body_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    embedding BYTEA NOT NULL,
    token_count INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(symbol_id, chunk_index),
    FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_body_embeddings_symbol ON body_embeddings(symbol_id);
  `);
  logger.error('[migrations] Body embeddings table ready');

  // 6. Update schema version
  db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(3);
  logger.error('[migrations] Schema version set to 3 (sync)');
}
