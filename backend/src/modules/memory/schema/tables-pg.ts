/**
 * memory/schema/tables-pg.ts — Base memory schema in PostgreSQL dialect.
 *
 * The SQLite base schema (tables.ts) is applied by DatabaseManager, which only
 * runs for SQLite. For PostgreSQL, DatabaseManager is skipped, so these base
 * tables (knowledge_entries + related) were never created — causing the
 * memory-module migrations (which only ALTER) to fail with "relation ... does
 * not exist". This module creates the equivalent base tables using PG dialect.
 *
 * Notes:
 * - FTS5 virtual table + triggers are SQLite-only. PostgreSQL full-text search
 *   is handled separately by fts-recreation.ts (tsvector_content + GIN index).
 * - Column set matches the final SQLite schema so subsequent migrations
 *   (001/002/etc.) detect existing columns and become no-ops.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

/** Base memory tables in PostgreSQL dialect (idempotent CREATE IF NOT EXISTS). */
const MEMORY_TABLES_PG_SQL = `
  CREATE TABLE IF NOT EXISTS knowledge_entries (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    summary TEXT NOT NULL,
    type TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'WORKING',
    scope TEXT NOT NULL DEFAULT 'USER',
    user_id TEXT DEFAULT NULL,
    project_id TEXT DEFAULT NULL,
    source TEXT,
    source_ref TEXT,
    tags TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 1.0,
    access_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (NOW()::TEXT),
    updated_at TEXT NOT NULL DEFAULT (NOW()::TEXT),
    last_accessed_at TEXT,
    expires_at TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    pin_order INTEGER NOT NULL DEFAULT 0,
    structured_map TEXT NOT NULL DEFAULT '{}',
    quality_score INTEGER DEFAULT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    agent_name TEXT DEFAULT NULL,
    owner TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS knowledge_vectors (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER NOT NULL UNIQUE,
    vector BYTEA NOT NULL,
    model TEXT NOT NULL DEFAULT 'paraphrase-multilingual-MiniLM-L12-v2',
    dimensions INTEGER NOT NULL DEFAULT 384,
    created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
  );

  CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
    id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    relation TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
  );

  CREATE TABLE IF NOT EXISTS consolidation_log (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER NOT NULL,
    from_tier TEXT NOT NULL,
    to_tier TEXT NOT NULL,
    reason TEXT NOT NULL,
    consolidated_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
  );

  CREATE TABLE IF NOT EXISTS memory_sessions (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    agent_name TEXT,
    started_at TEXT NOT NULL DEFAULT (NOW()::TEXT),
    ended_at TEXT,
    observation_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS memory_audit (
    id SERIAL PRIMARY KEY,
    operation TEXT NOT NULL,
    entry_id INTEGER,
    session_id TEXT,
    agent_name TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
  );

  CREATE TABLE IF NOT EXISTS conversation_turns (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    metadata TEXT,
    summarized INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
  );

  CREATE TABLE IF NOT EXISTS quality_scores (
    entry_id INTEGER PRIMARY KEY,
    total_score INTEGER NOT NULL DEFAULT 0,
    dimensions TEXT NOT NULL DEFAULT '{}',
    scored_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
  );

  CREATE TABLE IF NOT EXISTS citations (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER NOT NULL,
    cited_by TEXT NOT NULL,
    context TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (NOW()::TEXT),
    UNIQUE(entry_id, cited_by, context)
  );

  CREATE TABLE IF NOT EXISTS search_log (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    result_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
  );

  CREATE TABLE IF NOT EXISTS kb_shared_grants (
    project_id TEXT PRIMARY KEY,
    granted_by TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
  );
`;

const MEMORY_INDEXES_PG = [
  'CREATE INDEX IF NOT EXISTS idx_ke_type ON knowledge_entries(type)',
  'CREATE INDEX IF NOT EXISTS idx_ke_tier ON knowledge_entries(tier)',
  'CREATE INDEX IF NOT EXISTS idx_ke_project ON knowledge_entries(project_id)',
  'CREATE INDEX IF NOT EXISTS idx_kv_entry ON knowledge_vectors(entry_id)',
  'CREATE INDEX IF NOT EXISTS idx_kge_source ON knowledge_graph_edges(source_id)',
  'CREATE INDEX IF NOT EXISTS idx_kge_target ON knowledge_graph_edges(target_id)',
];

/**
 * Create the base memory schema for PostgreSQL (idempotent).
 * Must run BEFORE the memory-module migrations (001+), which only ALTER.
 */
export async function ensurePostgresMemorySchema(adapter: DatabaseAdapter): Promise<void> {
  await adapter.execAsync(MEMORY_TABLES_PG_SQL);
  for (const idx of MEMORY_INDEXES_PG) {
    await adapter.execAsync(idx);
  }
}
