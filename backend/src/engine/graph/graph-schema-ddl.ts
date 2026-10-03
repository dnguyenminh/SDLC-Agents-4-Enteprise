/**
 * Graph schema DDL + column helpers for the graph migrator.
 * Split out of migrator.ts so every module stays within the 200-line standard
 * (SA4E-223 / BR-18). SA4E-53: async + cross-engine (PostgreSQL + SQLite).
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

/** SA4E-107: Enrichment columns for LLM-generated metadata. */
const ENRICHMENT_COLUMNS = [
  { name: 'summary', type: 'TEXT' },
  { name: 'pseudo_code', type: 'TEXT' },
  { name: 'llm_tags', type: 'TEXT' },
  { name: 'enrichment_status', type: 'TEXT' },
  { name: 'enriched_at', type: 'TEXT' },
] as const;

/** Build cross-engine DDL for the relationships table. */
export function buildGraphSchema(engine: string): string {
  const serial = engine === 'sqlite' ? 'INTEGER PRIMARY KEY' : 'SERIAL PRIMARY KEY';
  return `
CREATE TABLE IF NOT EXISTS relationships (
    id ${serial},
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
`;
}

export function buildFileIndexSchema(engine: string): string {
  const ts = engine === 'sqlite' ? `(datetime('now'))` : 'current_timestamp';
  return `
CREATE TABLE IF NOT EXISTS file_index (
    path TEXT PRIMARY KEY,
    mtime INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    last_indexed TEXT NOT NULL DEFAULT ${ts},
    symbol_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_file_index_hash ON file_index(content_hash);
`;
}

export function buildGraphMetaSchema(engine: string): string {
  const conflict = engine === 'sqlite' ? 'INSERT OR IGNORE' : 'INSERT';
  const onConflict = engine === 'sqlite' ? '' : ' ON CONFLICT (key) DO NOTHING';
  return `
CREATE TABLE IF NOT EXISTS graph_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
${conflict} INTO graph_meta (key, value) VALUES ('schema_version', '3')${onConflict};
${conflict} INTO graph_meta (key, value) VALUES ('last_checkpoint', '')${onConflict};
${conflict} INTO graph_meta (key, value) VALUES ('total_nodes', '0')${onConflict};
${conflict} INTO graph_meta (key, value) VALUES ('total_edges', '0')${onConflict};
`;
}

export function buildBodyEmbeddingsSchema(engine: string): string {
  const serial = engine === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY';
  const ts = engine === 'sqlite' ? `(datetime('now'))` : 'current_timestamp';
  return `
CREATE TABLE IF NOT EXISTS body_embeddings (
    id ${serial},
    project_id TEXT NOT NULL DEFAULT '',
    symbol_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    embedding BYTEA NOT NULL,
    token_count INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${ts},
    UNIQUE(project_id, symbol_id, chunk_index),
    FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_body_embeddings_symbol ON body_embeddings(symbol_id);
`;
}

/** Execute DDL, ignoring "already exists" errors (idempotent). */
export async function execIdempotent(adapter: DatabaseAdapter, sql: string): Promise<void> {
  // Split on semicolons and execute each statement individually
  const stmts = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of stmts) {
    try {
      await adapter.execAsync(stmt);
    } catch (err: unknown) {
      const msg = (err as Error).message ?? '';
      if (msg.includes('already exists') || msg.includes('duplicate column')) continue;
      throw err;
    }
  }
}

export async function addEnhancedSymbolColumns(adapter: DatabaseAdapter): Promise<void> {
  const existing = await getExistingColumns(adapter, 'symbols');
  let added = 0;

  for (const col of ENHANCED_SYMBOL_COLUMNS) {
    if (!existing.has(col.name)) {
      try {
        await adapter.execAsync(`ALTER TABLE symbols ADD COLUMN ${col.name} ${col.type}`);
        added++;
      } catch (err) {
        logger.debug({ err, col: col.name }, '[migrator] ALTER TABLE failed (column may already exist)');
      }
    }
  }

  if (added > 0) {
    logger.error(`[graph-migrator] Added ${added} enhanced symbol columns`);
    try {
      await adapter.execAsync('CREATE INDEX IF NOT EXISTS idx_sym_parent ON symbols(parent_symbol_id)');
      await adapter.execAsync('CREATE INDEX IF NOT EXISTS idx_sym_exported ON symbols(is_exported)');
      await adapter.execAsync('CREATE INDEX IF NOT EXISTS idx_sym_file_kind ON symbols(file_id, kind)');
    } catch (err) {
      logger.debug({ err }, '[migrator] CREATE INDEX failed (index may already exist)');
    }
  }
}

/** SA4E-107: Add enrichment columns to symbols table (idempotent). */
export async function addEnrichmentColumns(adapter: DatabaseAdapter): Promise<void> {
  const existing = await getExistingColumns(adapter, 'symbols');
  let added = 0;

  for (const col of ENRICHMENT_COLUMNS) {
    if (!existing.has(col.name)) {
      try {
        await adapter.execAsync(`ALTER TABLE symbols ADD COLUMN ${col.name} ${col.type}`);
        added++;
      } catch (err) {
        logger.debug({ err, col: col.name }, '[migrator] ALTER TABLE failed (column may already exist)');
      }
    }
  }

  if (added > 0) {
    logger.error(`[graph-migrator] Added ${added} enrichment columns`);
  }

  // Create indexes for enrichment queries (idempotent)
  try {
    await adapter.execAsync('CREATE INDEX IF NOT EXISTS idx_symbols_enrichment_status ON symbols(enrichment_status)');
    await adapter.execAsync('CREATE INDEX IF NOT EXISTS idx_symbols_project_enrichment ON symbols(project_id, enrichment_status)');
  } catch (err) {
    logger.debug({ err }, '[migrator] CREATE INDEX failed (index may already exist)');
  }
}

export async function getExistingColumns(
  adapter: DatabaseAdapter, table: string,
): Promise<Set<string>> {
  try {
    // PostgreSQL: information_schema
    const pg = await adapter.allAsync<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [table],
    );
    if (pg.length > 0) return new Set(pg.map(r => r.column_name));
  } catch (err) { logger.debug({ err }, '[migrator] SQLite fallback '); }
  try {
    const sqlite = await adapter.allAsync<{ name: string }>(
      `SELECT name FROM pragma_table_info('${table}')`,
    );
    return new Set(sqlite.map(r => r.name));
  } catch (err) {
    logger.debug({ err, table }, '[migrator] SQLite column introspection failed');
    return new Set();
  }
}
