/**
 * KSA-153: Schema Migrator — Applies graph schema migrations.
 * Extends the existing migration system with graph-specific tables and columns.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';

const logger = pino({ name: 'graph-migrator' });

/** Enhanced symbol columns added for tree-sitter (KSA-145/153). */
const ENHANCED_SYMBOL_COLUMNS = [
  { name: 'parameters', type: 'TEXT' },
  { name: 'return_type', type: 'TEXT' },
  { name: 'parent_symbol_id', type: 'INTEGER' },
  { name: 'decorators', type: 'TEXT' },
  { name: 'complexity', type: 'INTEGER' },
  { name: 'is_async', type: 'INTEGER DEFAULT 0' },
  { name: 'is_exported', type: 'INTEGER DEFAULT 0' },
  { name: 'doc_comment_full', type: 'TEXT' },
  { name: 'modifiers', type: 'TEXT' },
] as const;

const GRAPH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
CREATE INDEX IF NOT EXISTS idx_rel_target_id ON relationships(target_symbol_id) WHERE target_symbol_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rel_file ON relationships(file_path);
`;

const FILE_INDEX_SQL = `
CREATE TABLE IF NOT EXISTS file_index (
    path TEXT PRIMARY KEY,
    mtime INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    last_indexed TEXT NOT NULL DEFAULT (datetime('now')),
    symbol_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_file_index_hash ON file_index(content_hash);
`;

const GRAPH_META_SQL = `
CREATE TABLE IF NOT EXISTS graph_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO graph_meta (key, value) VALUES
    ('schema_version', '3'),
    ('last_checkpoint', ''),
    ('total_nodes', '0'),
    ('total_edges', '0');
`;

const BODY_EMBEDDINGS_SQL = `
CREATE TABLE IF NOT EXISTS body_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    embedding BLOB NOT NULL,
    token_count INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(symbol_id, chunk_index),
    FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_body_embeddings_symbol ON body_embeddings(symbol_id);
`;

/**
 * Run graph-related migrations (KSA-153 + KSA-169).
 * Safe to call multiple times — all operations are idempotent.
 */
export function runGraphMigrations(adapter: DatabaseAdapter): void {
  logger.error('[graph-migrator] Running graph schema migrations...');

  addEnhancedSymbolColumns(adapter);
  adapter.exec(GRAPH_SCHEMA_SQL);
  logger.error('[graph-migrator] Relationships table ready');

  adapter.exec(FILE_INDEX_SQL);
  logger.error('[graph-migrator] File index table ready');

  adapter.exec(GRAPH_META_SQL);
  logger.error('[graph-migrator] Graph metadata table ready');

  adapter.exec(BODY_EMBEDDINGS_SQL);
  logger.error('[graph-migrator] Body embeddings table ready');

  adapter.run('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [3]);
  logger.error('[graph-migrator] Schema version set to 3');
}

function addEnhancedSymbolColumns(adapter: DatabaseAdapter): void {
  const existing = getExistingColumns(adapter, 'symbols');
  let added = 0;

  for (const col of ENHANCED_SYMBOL_COLUMNS) {
    if (!existing.has(col.name)) {
      try {
        adapter.exec(`ALTER TABLE symbols ADD COLUMN ${col.name} ${col.type}`);
        added++;
      } catch {
        // Column may already exist
      }
    }
  }

  if (added > 0) {
    logger.error(`[graph-migrator] Added ${added} enhanced symbol columns`);
    try {
      adapter.exec('CREATE INDEX IF NOT EXISTS idx_sym_parent ON symbols(parent_symbol_id) WHERE parent_symbol_id IS NOT NULL');
      adapter.exec('CREATE INDEX IF NOT EXISTS idx_sym_exported ON symbols(is_exported) WHERE is_exported = 1');
      adapter.exec('CREATE INDEX IF NOT EXISTS idx_sym_file_kind ON symbols(file_id, kind)');
    } catch {
      // Indexes may already exist
    }
  }
}

function getExistingColumns(adapter: DatabaseAdapter, table: string): Set<string> {
  const rows = adapter.all<{ name: string }>(`SELECT * FROM pragma_table_info('${table}')`);
  return new Set(rows.map(r => r.name));
}

/** Check if graph migrations have been applied. */
export function isGraphSchemaReady(adapter: DatabaseAdapter): boolean {
  try {
    const tables = adapter.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='relationships'",
    );
    return !!tables;
  } catch {
    return false;
  }
}
