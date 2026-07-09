/**
 * Memory Schema DDL — Full KB system (FTS5 + vector-ready + graph).
 * Ported from mcp-code-intelligence-nodejs extension.
 */

export const MEMORY_SCHEMA = `
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
  owner TEXT DEFAULT NULL
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
CREATE TRIGGER IF NOT EXISTS knowledge_fts_ad AFTER DELETE ON knowledge_entries BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, summary, content, tags, type)
  VALUES ('delete', old.id, old.summary, old.content, old.tags, old.type);
END;
CREATE TRIGGER IF NOT EXISTS knowledge_fts_au AFTER UPDATE ON knowledge_entries BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, summary, content, tags, type)
  VALUES ('delete', old.id, old.summary, old.content, old.tags, old.type);
  INSERT INTO knowledge_fts(rowid, summary, content, tags, type)
  VALUES (new.id, new.summary, new.content, new.tags, new.type);
END;

CREATE TABLE IF NOT EXISTS knowledge_vectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL UNIQUE,
  vector BLOB NOT NULL,
  model TEXT NOT NULL DEFAULT 'paraphrase-multilingual-MiniLM-L12-v2',
  dimensions INTEGER NOT NULL DEFAULT 384,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  relation TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (source_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS consolidation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  from_tier TEXT NOT NULL,
  to_tier TEXT NOT NULL,
  reason TEXT NOT NULL,
  consolidated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memory_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  agent_name TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  observation_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS memory_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL,
  entry_id INTEGER,
  session_id TEXT,
  agent_name TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  metadata TEXT,
  summarized INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  entity_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_scope_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_role TEXT NOT NULL UNIQUE,
  tag_set TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quality_scores (
  entry_id INTEGER PRIMARY KEY,
  total_score INTEGER NOT NULL DEFAULT 0,
  dimensions TEXT NOT NULL DEFAULT '{}',
  scored_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT DEFAULT NULL,
  parent_tag TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (entry_id, tag_id),
  FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS citations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  cited_by TEXT NOT NULL,
  context TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  UNIQUE(entry_id, cited_by, context)
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  description TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  required_sections TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  assignee TEXT DEFAULT NULL,
  interval_days INTEGER NOT NULL DEFAULT 90,
  next_due TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  snoozed_until TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS search_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS popular_queries (
  query TEXT PRIMARY KEY,
  hit_count INTEGER NOT NULL DEFAULT 1,
  avg_results REAL NOT NULL DEFAULT 0,
  last_searched TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ke_tier ON knowledge_entries(tier);
CREATE INDEX IF NOT EXISTS idx_ke_scope ON knowledge_entries(scope);
CREATE INDEX IF NOT EXISTS idx_ke_user_id ON knowledge_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_ke_scope_user ON knowledge_entries(scope, user_id);
CREATE INDEX IF NOT EXISTS idx_ke_type ON knowledge_entries(type);
CREATE INDEX IF NOT EXISTS idx_ke_source ON knowledge_entries(source);
CREATE INDEX IF NOT EXISTS idx_ke_confidence ON knowledge_entries(confidence);
CREATE INDEX IF NOT EXISTS idx_ke_access ON knowledge_entries(access_count);
CREATE INDEX IF NOT EXISTS idx_ke_created ON knowledge_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_ke_expires ON knowledge_entries(expires_at);
CREATE INDEX IF NOT EXISTS idx_ke_pinned ON knowledge_entries(pinned, pin_order);
CREATE INDEX IF NOT EXISTS idx_ke_archived ON knowledge_entries(archived);
CREATE INDEX IF NOT EXISTS idx_ke_quality ON knowledge_entries(quality_score);
CREATE INDEX IF NOT EXISTS idx_ke_agent_name ON knowledge_entries(agent_name);
CREATE INDEX IF NOT EXISTS idx_ke_tier_archived ON knowledge_entries(tier, archived, created_at);
CREATE INDEX IF NOT EXISTS idx_kv_entry ON knowledge_vectors(entry_id);
CREATE INDEX IF NOT EXISTS idx_kge_source ON knowledge_graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_kge_target ON knowledge_graph_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_kge_relation ON knowledge_graph_edges(relation);
CREATE INDEX IF NOT EXISTS idx_cl_entry ON consolidation_log(entry_id);
CREATE INDEX IF NOT EXISTS idx_ms_session ON memory_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_ms_status ON memory_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ma_operation ON memory_audit(operation);
CREATE INDEX IF NOT EXISTS idx_ma_entry ON memory_audit(entry_id);
CREATE INDEX IF NOT EXISTS idx_ma_session ON memory_audit(session_id);
CREATE INDEX IF NOT EXISTS idx_ma_created ON memory_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_ct_session ON conversation_turns(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_ct_role ON conversation_turns(role);
CREATE INDEX IF NOT EXISTS idx_ct_created ON conversation_turns(created_at);
CREATE INDEX IF NOT EXISTS idx_ct_summarized ON conversation_turns(summarized);
CREATE INDEX IF NOT EXISTS idx_ei_name ON entity_index(entity_name);
CREATE INDEX IF NOT EXISTS idx_ei_type ON entity_index(entity_type);
CREATE INDEX IF NOT EXISTS idx_ei_entry ON entity_index(entry_id);
CREATE INDEX IF NOT EXISTS idx_citations_entry ON citations(entry_id);
CREATE INDEX IF NOT EXISTS idx_attachments_entry ON attachments(entry_id);
CREATE INDEX IF NOT EXISTS idx_feedback_entry ON feedback(entry_id);
CREATE INDEX IF NOT EXISTS idx_reminders_entry ON reminders(entry_id);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
CREATE INDEX IF NOT EXISTS idx_search_log_created ON search_log(created_at);

-- Indexes for project isolation
CREATE INDEX IF NOT EXISTS idx_ke_project_id ON knowledge_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_ke_scope_project ON knowledge_entries(scope, project_id);

-- Default agent scope config
INSERT OR IGNORE INTO agent_scope_config (agent_role, tag_set) VALUES
  ('QA', '["testing","qa","test-plan","test-case","bug"]'),
  ('DEV', '["code","api","architecture","implementation","design"]'),
  ('BA', '["requirement","business","stakeholder","process"]'),
  ('SA', '["architecture","design","infrastructure","security"]'),
  ('DEVOPS', '["deployment","infrastructure","ci-cd","monitoring"]');
`;

/**
 * Migration: Add project_id column to existing databases.
 * Safe to run multiple times — catches "duplicate column" error.
 */
export function migrateProjectId(db: { exec: (sql: string) => void }): void {
  try {
    db.exec('ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('duplicate column')) throw err;
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_ke_project_id ON knowledge_entries(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ke_scope_project ON knowledge_entries(scope, project_id)');
}
