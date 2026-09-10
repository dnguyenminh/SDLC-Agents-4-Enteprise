/**
 * KSA-153: Schema Migrator — Applies graph schema migrations.
 * SA4E-53: async + cross-engine (PostgreSQL + SQLite) compatible.
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
function buildGraphSchema(engine: string): string {
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

function buildFileIndexSchema(engine: string): string {
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

function buildGraphMetaSchema(engine: string): string {
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

function buildBodyEmbeddingsSchema(engine: string): string {
  const serial = engine === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY';
  const ts = engine === 'sqlite' ? `(datetime('now'))` : 'current_timestamp';
  return `
CREATE TABLE IF NOT EXISTS body_embeddings (
    id ${serial},
    symbol_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    embedding BYTEA NOT NULL,
    token_count INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${ts},
    UNIQUE(symbol_id, chunk_index),
    FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_body_embeddings_symbol ON body_embeddings(symbol_id);
`;
}

/**
 * Run graph-related migrations (KSA-153 + KSA-169).
 * Safe to call multiple times — all operations are idempotent.
 */
export async function runGraphMigrations(adapter: DatabaseAdapter): Promise<void> {
  const engine = adapter.getEngine();
  logger.error(`[graph-migrator] Running graph schema migrations (engine: ${engine})...`);

  await addEnhancedSymbolColumns(adapter);

  // SA4E-107: Add enrichment columns
  await addEnrichmentColumns(adapter);

  await execIdempotent(adapter, buildGraphSchema(engine));
  logger.error('[graph-migrator] Relationships table ready');

  await execIdempotent(adapter, buildFileIndexSchema(engine));
  logger.error('[graph-migrator] File index table ready');

  await execIdempotent(adapter, buildGraphMetaSchema(engine));
  logger.error('[graph-migrator] Graph metadata table ready');

  await execIdempotent(adapter, buildBodyEmbeddingsSchema(engine));
  logger.error('[graph-migrator] Body embeddings table ready');

  // SA4E: PostgreSQL full-text search infrastructure for code symbols.
  // SQLite already has the symbols_fts FTS5 virtual table (see engine/db/schema.ts);
  // PostgreSQL needs a tsvector column + GIN index + maintenance trigger instead.
  if (engine === 'postgresql') {
    await ensurePostgresSymbolFts(adapter);
    logger.error('[graph-migrator] PostgreSQL symbol FTS (tsvector) ready');
  }

  // Update schema version
  if (engine === 'sqlite') {
    await adapter.runAsync('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [3]);
  } else {
    await adapter.runAsync(
      'INSERT INTO schema_version (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
      [3],
    );
  }
  logger.error('[graph-migrator] Schema version set to 3');
}

/**
 * Create PostgreSQL full-text search infrastructure on the `symbols` table.
 * Adds a `search_tsv` tsvector column (weighted: name > signature > doc_comment),
 * a GIN index for fast @@ lookups, a BEFORE INSERT/UPDATE trigger to keep it
 * current, and backfills existing rows. Idempotent — safe to run repeatedly.
 *
 * Exported so it can be ensured on every startup independent of the graph
 * schema gate (existing deployments already have `relationships`, so
 * runGraphMigrations would otherwise be skipped and the column never created).
 * No-op on non-PostgreSQL engines — SQLite uses the symbols_fts FTS5 table.
 */
export async function ensurePostgresSymbolFts(adapter: DatabaseAdapter): Promise<void> {
  if (adapter.getEngine() !== 'postgresql') return;
  const stmts = [
    `ALTER TABLE symbols ADD COLUMN IF NOT EXISTS search_tsv tsvector`,
    `CREATE INDEX IF NOT EXISTS idx_symbols_search_tsv ON symbols USING GIN (search_tsv)`,
    `CREATE OR REPLACE FUNCTION symbols_tsv_update() RETURNS trigger AS $$
      BEGIN
        NEW.search_tsv :=
          setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.signature, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(NEW.doc_comment, '')), 'C');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`,
    `DROP TRIGGER IF EXISTS trg_symbols_tsv ON symbols`,
    `CREATE TRIGGER trg_symbols_tsv
       BEFORE INSERT OR UPDATE ON symbols
       FOR EACH ROW EXECUTE FUNCTION symbols_tsv_update()`,
    `UPDATE symbols SET search_tsv =
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(signature, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(doc_comment, '')), 'C')
      WHERE search_tsv IS NULL`,
  ];
  for (const stmt of stmts) {
    await adapter.execAsync(stmt);
  }
}

/** Execute DDL, ignoring "already exists" errors (idempotent). */
async function execIdempotent(adapter: DatabaseAdapter, sql: string): Promise<void> {
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

async function addEnhancedSymbolColumns(adapter: DatabaseAdapter): Promise<void> {
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
async function addEnrichmentColumns(adapter: DatabaseAdapter): Promise<void> {
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

async function getExistingColumns(adapter: DatabaseAdapter, table: string): Promise<Set<string>> {
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
  } catch (err) { logger.debug({ err, table }, '[migrator] SQLite column introspection failed'); return new Set(); }
}

/** Check if graph migrations have been applied. */
export async function isGraphSchemaReady(adapter: DatabaseAdapter): Promise<boolean> {
  try {
    // PostgreSQL
    const pg = await adapter.allAsync<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'relationships'`,
    );
    if (pg.length > 0) return true;
  } catch (err) { logger.debug({ err }, '[migrator] Operation failed (non-fatal)'); }
  try {
    // SQLite
    const lite = await adapter.getAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='relationships'",
    );
    return !!lite;
  } catch (err) { logger.debug({ err }, '[migrator] SQLite schema introspection failed'); return false; }
}
