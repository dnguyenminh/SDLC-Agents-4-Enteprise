/**
 * Shared fixtures for memory learning-suite tests (Learning.*, InstinctSystem.*).
 */
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { MemoryEngine } from '../engine/core.js';

/** Create in-memory test DB with required tables for the learning suite. */
export async function createLearningTestEngine(): Promise<MemoryEngine> {
  const adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  adapter.exec(`
    CREATE TABLE knowledge_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      summary TEXT DEFAULT '',
      type TEXT DEFAULT 'CONTEXT',
      tier TEXT DEFAULT 'T1',
      scope TEXT DEFAULT 'USER',
      user_id TEXT, workspace_id TEXT, project_id TEXT,
      source TEXT, source_ref TEXT, tags TEXT DEFAULT '',
      confidence REAL DEFAULT 1.0,
      access_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_accessed_at TEXT,
      expires_at TEXT, pinned INTEGER DEFAULT 0,
      pin_order INTEGER DEFAULT 0,
      structured_map TEXT DEFAULT '{}',
      quality_score REAL, archived INTEGER DEFAULT 0,
      agent_name TEXT, owner TEXT,
      needs_verification INTEGER DEFAULT 0,
      epoch_id TEXT, superseded_by INTEGER,
      enrichment_status TEXT DEFAULT 'done',
      enriched_by TEXT, enriched_at TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts
      USING fts5(content, summary, content=knowledge_entries, content_rowid=id);
    CREATE TRIGGER IF NOT EXISTS ke_ai AFTER INSERT ON knowledge_entries BEGIN
      INSERT INTO knowledge_fts(rowid, content, summary) VALUES (new.id, new.content, new.summary);
    END;
    CREATE TABLE memory_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE, agent_name TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT, status TEXT DEFAULT 'active',
      observation_count INTEGER DEFAULT 0
    );
    CREATE TABLE memory_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT, entry_id INTEGER,
      session_id TEXT, agent_name TEXT,
      details TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE consolidation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER, from_tier TEXT, to_tier TEXT,
      reason TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE decay_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE tool_usage (
      tool_name TEXT PRIMARY KEY,
      call_count INTEGER DEFAULT 0,
      last_called_at TEXT
    );
  `);
  return new MemoryEngine(adapter);
}

/** Create in-memory test DB with required tables for the instinct suite. */
export async function createInstinctTestDb(): Promise<SqliteAdapter> {
  const adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  adapter.exec(`
    CREATE TABLE knowledge_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      summary TEXT DEFAULT '',
      type TEXT DEFAULT 'CONTEXT',
      tier TEXT DEFAULT 'T1',
      scope TEXT DEFAULT 'USER',
      user_id TEXT, workspace_id TEXT, project_id TEXT,
      source TEXT, source_ref TEXT, tags TEXT DEFAULT '',
      confidence REAL DEFAULT 1.0,
      access_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_accessed_at TEXT,
      expires_at TEXT, pinned INTEGER DEFAULT 0,
      pin_order INTEGER DEFAULT 0,
      structured_map TEXT DEFAULT '{}',
      quality_score REAL, archived INTEGER DEFAULT 0,
      agent_name TEXT, owner TEXT,
      needs_verification INTEGER DEFAULT 0,
      epoch_id TEXT, superseded_by INTEGER,
      enrichment_status TEXT DEFAULT 'done',
      enriched_by TEXT, enriched_at TEXT
    );
    CREATE TABLE decay_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE entry_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('success', 'fail', 'partial')),
      agent_name TEXT, context TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
    );
    CREATE TABLE contradiction_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id_a INTEGER NOT NULL,
      entry_id_b INTEGER NOT NULL,
      similarity REAL NOT NULL,
      classification TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unresolved',
      resolution TEXT, resolved_by TEXT,
      detected_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT, project_id TEXT,
      FOREIGN KEY (entry_id_a) REFERENCES knowledge_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (entry_id_b) REFERENCES knowledge_entries(id) ON DELETE CASCADE
    );
  `);
  return adapter;
}
