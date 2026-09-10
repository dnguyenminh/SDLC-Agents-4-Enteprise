/**
 * PostgreSQL Schema Ensure — runs on startup to guarantee index tables
 * (files, symbols, body_embeddings) exist with correct schema.
 *
 * Fixes SA4E schema mismatch: PG migration created incompatible schema
 * vs what engine/db/schema.ts (SQLite) defines. This ensures both engines
 * have identical table structure for the indexing pipeline.
 *
 * Safe to run multiple times (uses IF NOT EXISTS + IF NOT EXISTS for columns).
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import pino from 'pino';

const logger = pino({ name: 'pg-schema-ensure' });

/**
 * Ensure engine "core" tables needed EARLY (before module init / tool ingestion)
 * exist for PostgreSQL. Separated from the full ensure below because
 * ensurePostgresIndexSchema also ALTERs memory tables that only exist after the
 * memory module initializes — whereas these tables are needed at ALL_MODULES_READY.
 *
 * Mirrors the SQLite definitions in engine/db/schema.ts (mcp_tools, tool_usage).
 */
export async function ensurePostgresCoreTables(adapter: DatabaseAdapter): Promise<void> {
  if (adapter.getEngine() !== 'postgresql') return;
  if (!adapter.isConnected()) return;

  await adapter.execAsync(`
    CREATE TABLE IF NOT EXISTS mcp_tools (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      schema_json TEXT NOT NULL DEFAULT '{}',
      category TEXT,
      server TEXT,
      vector BYTEA
    )
  `);
  await safeExec(adapter, 'CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON mcp_tools(server)');
  await adapter.execAsync(`
    CREATE TABLE IF NOT EXISTS tool_usage (
      tool_name TEXT PRIMARY KEY,
      call_count INTEGER NOT NULL DEFAULT 0,
      last_called_at TEXT
    )
  `);
}

/**
 * Ensure PostgreSQL has the correct index schema on startup.
 * Called from PostgresAdapter.connect() or server init when engine=postgresql.
 */
export async function ensurePostgresIndexSchema(adapter: DatabaseAdapter): Promise<void> {
  if (adapter.getEngine() !== 'postgresql') return;
  if (!adapter.isConnected()) return;

  try {
    // Core engine tables (idempotent — also created early during startup)
    await ensurePostgresCoreTables(adapter);

    // 1. Ensure files table exists with correct columns
    await adapter.execAsync(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        path TEXT NOT NULL DEFAULT '',
        relative_path TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT '',
        module TEXT,
        content_hash TEXT NOT NULL DEFAULT '',
        size_bytes INTEGER NOT NULL DEFAULT 0,
        last_indexed TEXT NOT NULL DEFAULT (NOW()::TEXT),
        line_count INTEGER NOT NULL DEFAULT 0
      )
    `);
    await safeExec(adapter, `CREATE UNIQUE INDEX IF NOT EXISTS idx_files_project_path ON files(project_id, path)`);

    // 2. Ensure symbols table
    await adapter.execAsync(`
      CREATE TABLE IF NOT EXISTS symbols (
        id SERIAL PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        file_id INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT '',
        signature TEXT,
        start_line INTEGER NOT NULL DEFAULT 0,
        end_line INTEGER NOT NULL DEFAULT 0,
        parent_symbol TEXT,
        visibility TEXT,
        doc_comment TEXT,
        is_exported INTEGER DEFAULT 0,
        complexity INTEGER DEFAULT 0
      )
    `);

    // 3. Ensure body_embeddings table (SA4E-104: includes project_id + UNIQUE constraint)
    await adapter.execAsync(`
      CREATE TABLE IF NOT EXISTS body_embeddings (
        id SERIAL PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        symbol_id INTEGER NOT NULL DEFAULT 0,
        chunk_index INTEGER NOT NULL DEFAULT 0,
        embedding BYTEA,
        token_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(project_id, symbol_id, chunk_index)
      )
    `);
    // SA4E-104: Add project_id column if table already exists without it
    await safeExec(adapter, `ALTER TABLE body_embeddings ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT ''`);
    await safeExec(adapter, `ALTER TABLE body_embeddings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    // SA4E-104: Create UNIQUE constraint for upsert ON CONFLICT clause
    await safeExec(adapter, `CREATE UNIQUE INDEX IF NOT EXISTS idx_body_embeddings_upsert ON body_embeddings(project_id, symbol_id, chunk_index)`);

    // 4. Ensure pending_tasks has serial ID
    await safeExec(adapter, `CREATE SEQUENCE IF NOT EXISTS pending_tasks_id_seq`);
    await safeExec(adapter, `ALTER TABLE pending_tasks ALTER COLUMN id SET DEFAULT nextval('pending_tasks_id_seq')`);

    // Ensure relationships has serial ID (table may have been created without SERIAL default)
    await safeExec(adapter, `CREATE SEQUENCE IF NOT EXISTS relationships_id_seq`);
    await safeExec(adapter, `ALTER TABLE relationships ALTER COLUMN id SET DEFAULT nextval('relationships_id_seq')`);
    await safeExec(adapter, `SELECT setval('relationships_id_seq', COALESCE((SELECT MAX(id) FROM relationships WHERE id IS NOT NULL), 0) + 1, false)`);

    // SA4E-171: Drop FK on pending_tasks.entry_id → knowledge_entries(id)
    // This allows entry_id to store symbolId for CODE_ENRICHMENT tasks (OI-01)
    await safeExec(adapter, `ALTER TABLE pending_tasks DROP CONSTRAINT IF EXISTS pending_tasks_entry_id_fkey`);
    // 5. Ensure indexes exist
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_files_relpath ON files(relative_path)',
      'CREATE INDEX IF NOT EXISTS idx_symbols_project ON symbols(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id)',
      'CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)',
      'CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind)',
      'CREATE INDEX IF NOT EXISTS idx_body_symbol ON body_embeddings(symbol_id)',
    ];
    for (const idx of indexes) {
      await safeExec(adapter, idx);
    }

    // 6. Ensure knowledge_entries has vector column
    await safeExec(adapter, `ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS vector BYTEA DEFAULT NULL`);

    // 7. Add ALL columns used by indexing engine (from engine/db/migrations.ts + indexing-engine.ts)
    // Files table: full column set from indexing-engine.ts INSERT
    const fileColumns = [
      'content_hash TEXT NOT NULL DEFAULT \'\'',
      'size_bytes INTEGER NOT NULL DEFAULT 0',
      'line_count INTEGER NOT NULL DEFAULT 0',
      'last_indexed TEXT DEFAULT NULL',
      'file_created_at TEXT DEFAULT NULL',
      'file_author TEXT DEFAULT NULL',
      'file_version TEXT DEFAULT NULL',
      'file_modified_at TEXT DEFAULT NULL',
    ];
    for (const col of fileColumns) {
      await safeExec(adapter, `ALTER TABLE files ADD COLUMN IF NOT EXISTS ${col}`);
    }

    // Symbols table: enhanced columns from migrations.ts applyGraphMigrationsSync
    const symColumns = [
      'is_exported INTEGER DEFAULT 0',
      'complexity INTEGER DEFAULT 0',
      'parent_symbol_id INTEGER DEFAULT NULL',
      'parameters TEXT DEFAULT NULL',
      'return_type TEXT DEFAULT NULL',
      'decorators TEXT DEFAULT NULL',
      'is_async INTEGER DEFAULT 0',
      'doc_comment_full TEXT DEFAULT NULL',
      'modifiers TEXT DEFAULT NULL',
      'file_path TEXT DEFAULT NULL',
      // SA4E-107: LLM enrichment columns
      'enrichment_status TEXT DEFAULT NULL',
      'summary TEXT DEFAULT NULL',
      'pseudo_code TEXT DEFAULT NULL',
      'llm_tags TEXT DEFAULT NULL',
      'enriched_at TEXT DEFAULT NULL',
    ];
    for (const col of symColumns) {
      await safeExec(adapter, `ALTER TABLE symbols ADD COLUMN IF NOT EXISTS ${col}`);
    }

    // 8. Supporting tables from migrations.ts
    await safeExec(adapter, `CREATE TABLE IF NOT EXISTS relationships (
      id SERIAL PRIMARY KEY, project_id TEXT NOT NULL DEFAULT '', source_symbol_id INTEGER NOT NULL, target_symbol TEXT NOT NULL,
      target_symbol_id INTEGER, kind TEXT NOT NULL, file_path TEXT NOT NULL DEFAULT '', line INTEGER NOT NULL DEFAULT 0, metadata TEXT
    )`);
    // SA4E-104: Ensure project_id exists if table was created before this column was added
    await safeExec(adapter, `ALTER TABLE relationships ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT ''`);
    await safeExec(adapter, `CREATE TABLE IF NOT EXISTS file_index (
      path TEXT PRIMARY KEY, mtime INTEGER NOT NULL DEFAULT 0, content_hash TEXT NOT NULL DEFAULT '',
      size_bytes INTEGER NOT NULL DEFAULT 0, last_indexed TEXT NOT NULL DEFAULT (NOW()::TEXT), symbol_count INTEGER DEFAULT 0
    )`);
    await safeExec(adapter, `CREATE TABLE IF NOT EXISTS graph_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`);
    await safeExec(adapter, `CREATE TABLE IF NOT EXISTS code_dependencies (
      id SERIAL PRIMARY KEY, source_file_id INTEGER NOT NULL, target_file_id INTEGER, target_path TEXT NOT NULL DEFAULT ''
    )`);
    await safeExec(adapter, `CREATE TABLE IF NOT EXISTS code_call_graph (
      id SERIAL PRIMARY KEY, caller_symbol_id INTEGER NOT NULL, callee_symbol_id INTEGER NOT NULL, call_site_line INTEGER DEFAULT 0
    )`);
    await safeExec(adapter, `CREATE TABLE IF NOT EXISTS code_imports (
      id SERIAL PRIMARY KEY, file_id INTEGER NOT NULL, imported_name TEXT NOT NULL DEFAULT '', source_module TEXT NOT NULL DEFAULT '', is_default INTEGER DEFAULT 0
    )`);
    await safeExec(adapter, `CREATE TABLE IF NOT EXISTS modules (
      id SERIAL PRIMARY KEY, project_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', path TEXT
    )`);

    // 9. Additional indexes
    await safeExec(adapter, 'CREATE INDEX IF NOT EXISTS idx_sym_parent ON symbols(parent_symbol_id)');
    await safeExec(adapter, 'CREATE INDEX IF NOT EXISTS idx_sym_exported ON symbols(is_exported)');
    await safeExec(adapter, 'CREATE INDEX IF NOT EXISTS idx_sym_file_kind ON symbols(file_id, kind)');
    await safeExec(adapter, 'CREATE INDEX IF NOT EXISTS idx_rel_source_kind ON relationships(source_symbol_id, kind)');
    await safeExec(adapter, 'CREATE INDEX IF NOT EXISTS idx_file_index_hash ON file_index(content_hash)');

    logger.info('[pg-schema-ensure] Index schema verified/fixed');
  } catch (err) {
    logger.error({ err }, '[pg-schema-ensure] Schema ensure failed (non-fatal)');
  }
}

/** Execute SQL silently — log and continue on error. */
async function safeExec(adapter: DatabaseAdapter, sql: string): Promise<void> {
  try {
    await adapter.runAsync(sql, []);
  } catch {
    // Ignore — statement may be redundant (column/index already exists)
  }
}
