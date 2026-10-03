/**
 * Versioned migration steps (V1–V4) + shared column helpers, split out of
 * migrations.ts so every module stays within the 200-line standard
 * (SA4E-223 / BR-18). SA4E-53: uses QueryDatabaseAdapter (no raw handle).
 */

import pino from 'pino';
import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { SCHEMA_V1 } from './schema.js';

const logger = pino({ name: 'migrations' });

/** A single versioned migration: executed once, tracked in schema_version. */
export interface Migration {
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

/** Apply the base engine schema (idempotent — every statement is IF NOT EXISTS). */
export async function applyMemorySchema(db: QueryDatabaseAdapter): Promise<void> {
  try {
    await db.execAsync(SCHEMA_V1);
  } catch (err) {
    logger.error({ err }, '[migrations] Memory schema error (graceful):');
  }
}

/** Execute one migration SQL blob and record its version. */
export async function applyMigration(db: QueryDatabaseAdapter, migration: Migration): Promise<void> {
  await db.execAsync(migration.sql);
  await db.runAsync('INSERT INTO schema_version (version) VALUES (?)', [migration.version]);
  logger.error(`[migrations] v${migration.version} applied`);
}

/** Migration V2 — Add pattern metadata columns to modules table. */
export async function applyMigrationV2(db: QueryDatabaseAdapter): Promise<void> {
  try {
    const existing = await getExistingColumns(db, 'modules');
    let added = 0;

    for (const col of MIGRATION_V2_COLUMNS) {
      if (!existing.has(col)) {
        await db.execAsync(`ALTER TABLE modules ADD COLUMN ${col} TEXT DEFAULT NULL`);
        added++;
      }
    }

    await db.runAsync('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [2]);
    logger.error(`[migrations] V2: Added ${added} pattern columns`);
  } catch (err) {
    logger.error({ err }, `[migrations] V2 error (graceful degradation):`);
  }
}

/** Migration V4 — drop + recreate the memory tables from SCHEMA_V1. */
export async function applyMigrationV4(db: QueryDatabaseAdapter): Promise<void> {
  try {
    const memoryTables = [
      'knowledge_entries', 'knowledge_vectors', 'knowledge_graph_edges',
      'consolidation_log', 'memory_sessions', 'memory_audit',
      'conversation_turns', 'entity_index', 'agent_scope_config',
      'quality_scores', 'tags', 'entry_tags', 'citations',
      'attachments', 'templates', 'feedback', 'reminders',
      'search_log', 'popular_queries', 'knowledge_fts',
    ];

    await db.execAsync('PRAGMA foreign_keys=OFF;');
    for (const table of memoryTables) {
      await db.execAsync(`DROP TABLE IF EXISTS ${table};`);
    }
    await db.execAsync('PRAGMA foreign_keys=ON;');

    await applyMemorySchema(db);
    await db.runAsync('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [4]);
    logger.error('[migrations] V4: Memory tables dropped and recreated');
  } catch (err) {
    logger.error({ err }, `[migrations] V4 error:`);
  }
}

/** Get set of column names for a table via pragma_table_info. */
export async function getExistingColumns(db: QueryDatabaseAdapter, table: string): Promise<Set<string>> {
  const rows = await db.allAsync<{ name: string }>(`PRAGMA table_info('${table}')`);
  return new Set(rows.map(r => r.name));
}

/** Migration V3 — graph schema (KSA-145/153/169), SQLite synchronous DDL. */
export async function applyGraphMigrationsSync(db: QueryDatabaseAdapter): Promise<void> {
  logger.error('[migrations] Running graph schema migrations (SQLite sync)...');

  // 1. Add enhanced columns to symbols
  const existing = await getExistingColumns(db, 'symbols');
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
        await db.execAsync(`ALTER TABLE symbols ADD COLUMN ${col.name} ${col.type}`);
        added++;
      } catch { /* Column may already exist */ }
    }
  }

  if (added > 0) {
    logger.error(`[migrations] Added ${added} enhanced symbol columns`);
    try {
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_sym_parent ON symbols(parent_symbol_id)');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_sym_exported ON symbols(is_exported)');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_sym_file_kind ON symbols(file_id, kind)');
    } catch { /* Indexes may already exist */ }
  }

  // 2. Create relationships table
  await db.execAsync(`
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
  await db.execAsync(`
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
  await db.execAsync(`
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
  await db.execAsync(`
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
  await db.runAsync('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [3]);
  logger.error('[migrations] Schema version set to 3 (sync)');
}
