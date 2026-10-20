/**
 * Shared fixtures for memory module unit tests (Procedure/IsolationLayer).
 * See *.crud/share/skill-*.test.ts files.
 */
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../task-queue/SqliteDbAdapter.js';
import { MemoryEngine } from '../engine/index.js';
import type { KnowledgeEntry } from '../models.js';

export const MEMORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL, summary TEXT NOT NULL, type TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'WORKING', scope TEXT NOT NULL DEFAULT 'USER',
  user_id TEXT DEFAULT NULL, project_id TEXT DEFAULT NULL,
  source TEXT, source_ref TEXT, tags TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 1.0, access_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT, expires_at TEXT,
  pinned INTEGER NOT NULL DEFAULT 0, pin_order INTEGER NOT NULL DEFAULT 0,
  structured_map TEXT NOT NULL DEFAULT '{}', quality_score INTEGER DEFAULT NULL,
  archived INTEGER NOT NULL DEFAULT 0, agent_name TEXT DEFAULT NULL,
  owner TEXT DEFAULT NULL, epoch_id TEXT DEFAULT NULL, superseded_by INTEGER DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS memory_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE, agent_name TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT, observation_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS conversation_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL, turn_number INTEGER NOT NULL,
  role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
  tool_calls TEXT, metadata TEXT, summarized INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS memory_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL, entry_id INTEGER,
  session_id TEXT, agent_name TEXT, details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  summary, content, tags, type,
  content=knowledge_entries, content_rowid=id,
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS knowledge_fts_ai AFTER INSERT ON knowledge_entries BEGIN
  INSERT INTO knowledge_fts(rowid, summary, content, tags, type)
  VALUES (new.id, new.summary, new.content, new.tags, new.type);
END;
CREATE TABLE IF NOT EXISTS kb_shared_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL, granted_project_id TEXT NOT NULL,
  granted_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export async function makeTestEngine(): Promise<MemoryEngine> {
  const db = new SqliteAdapter(':memory:');
  await db.connect();
  await db.exec(MEMORY_SCHEMA);
  const adapter = new SqliteDbAdapter(db);
  const engine = new MemoryEngine(adapter as any);
  return engine;
}

/** Helper to create a minimal KnowledgeEntry for testing (IsolationLayer). */
export function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 1, content: 'test', summary: 'test', type: 'CONTEXT',
    tier: 'WORKING', scope: 'PROJECT', user_id: 'user-1',
    workspace_id: null,
    project_id: 'app-A', source: null, source_ref: null, tags: '',
    confidence: 1.0, access_count: 0, created_at: '', updated_at: '',
    last_accessed_at: null, expires_at: null, pinned: 0, pin_order: 0,
    structured_map: '{}', quality_score: null, archived: 0,
    agent_name: null, owner: null,
    ...overrides,
  };
}

/** Close the in-memory DB behind a test engine (use in afterEach). */
export async function disconnectTestEngine(engine: MemoryEngine): Promise<void> {
  const adapter = engine.getAdapter() as any;
  if (adapter?.db?.disconnect) {
    await adapter.db.disconnect();
  }
}
