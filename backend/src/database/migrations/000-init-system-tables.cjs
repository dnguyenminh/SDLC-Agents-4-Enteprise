/**
 * Migration 000: Initialize system tables (Knex manual-migration snapshot).
 *
 * Canonical schemas — copied from the runtime sources of truth so a manual
 * `npx knex migrate:latest` produces the same tables the dev server creates:
 *   - mcp_tools         <- src/engine/db/schema.ts SCHEMA_V1
 *   - knowledge_entries <- src/modules/memory/schema/tables.ts TABLES (+FTS/triggers)
 *   - pending_tasks     <- src/modules/memory/migrations/003-pending-tasks.ts
 *
 * SQLite flavor (staging/dev). Production uses PostgreSQL via DATABASE_URL.
 * NOTE: the dev server does NOT run Knex at startup; it uses its own
 * engine/db migrations + schema-registry ensures. This file is for manual
 * provisioning / fresh environments only. Run with the same env as the server:
 *   CODE_INTEL_DATA_DIR=C:\staging\data CODE_INTEL_DB=index-staging.db
 *   npx knex migrate:latest --knexfile knexfile.cjs
 */

'use strict';

const up = async function(knex) {
  // 1. mcp_tools — registered MCP tools (canonical: schema.ts)
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS mcp_tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      schema_json TEXT NOT NULL,
      category TEXT,
      server TEXT,
      vector BLOB
    )
  `);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON mcp_tools(server)`);

  // 2. knowledge_entries — knowledge base (canonical: memory/schema/tables.ts)
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS knowledge_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_accessed_at TEXT,
      expires_at TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      pin_order INTEGER NOT NULL DEFAULT 0,
      structured_map TEXT NOT NULL DEFAULT '{}',
      quality_score INTEGER DEFAULT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      agent_name TEXT DEFAULT NULL,
      owner TEXT DEFAULT NULL,
      needs_verification INTEGER NOT NULL DEFAULT 0,
      epoch_id TEXT DEFAULT NULL,
      superseded_by INTEGER DEFAULT NULL
    )
  `);
  await knex.raw(`
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
      summary, content, tags, type,
      content=knowledge_entries, content_rowid=id,
      tokenize='porter unicode61'
    )
  `);
  await knex.raw(`
    CREATE TRIGGER IF NOT EXISTS knowledge_fts_ai AFTER INSERT ON knowledge_entries BEGIN
      INSERT INTO knowledge_fts(rowid, summary, content, tags, type)
      VALUES (new.id, new.summary, new.content, new.tags, new.type);
    END
  `);
  await knex.raw(`
    CREATE TRIGGER IF NOT EXISTS knowledge_fts_ad AFTER DELETE ON knowledge_entries BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, summary, content, tags, type)
      VALUES ('delete', old.id, old.summary, old.content, old.tags, old.type);
    END
  `);
  await knex.raw(`
    CREATE TRIGGER IF NOT EXISTS knowledge_fts_au AFTER UPDATE ON knowledge_entries BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, summary, content, tags, type)
      VALUES ('delete', old.id, old.summary, old.content, old.tags, old.type);
      INSERT INTO knowledge_fts(rowid, summary, content, tags, type)
      VALUES (new.id, new.summary, new.content, new.tags, new.type);
    END
  `);

  // 3. pending_tasks — SDLC pipeline queue (canonical: migration 003)
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS pending_tasks (
      id INTEGER PRIMARY KEY,
      task_type TEXT NOT NULL,
      entry_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT NOT NULL,
      error TEXT,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      priority INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT,
      claimed_at TEXT,
      dead_lettered_at TEXT,
      FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
    )
  `);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_pending_tasks_status_created ON pending_tasks(status, created_at)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_pending_tasks_entry_id ON pending_tasks(entry_id)`);
};

const down = async function(knex) {
  await knex.raw(`DROP TABLE IF EXISTS pending_tasks`);
  await knex.raw(`DROP TRIGGER IF EXISTS knowledge_fts_au`);
  await knex.raw(`DROP TRIGGER IF EXISTS knowledge_fts_ad`);
  await knex.raw(`DROP TRIGGER IF EXISTS knowledge_fts_ai`);
  await knex.raw(`DROP TABLE IF EXISTS knowledge_fts`);
  await knex.raw(`DROP TABLE IF EXISTS knowledge_entries`);
  await knex.raw(`DROP TABLE IF EXISTS mcp_tools`);
};

module.exports = { up, down };