/**
 * DDL constants for SQLite schema — files, symbols, modules, embeddings.
 * Uses FTS5 with porter tokenizer for full-text search on symbols.
 */

import { MEMORY_SCHEMA } from '../../modules/memory/schema/index.js';

export const SCHEMA_V1 = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexed files with content hash for incremental updates
-- SA4E-41: project_id scopes every file to a single tenant (multi-tenant isolation)
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  language TEXT NOT NULL,
  module TEXT,
  content_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  last_indexed TEXT NOT NULL DEFAULT (datetime('now')),
  line_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, path)
);

-- Extracted symbols (functions, classes, interfaces, etc.)
-- SA4E-41: project_id added additively to preserve FTS5 external-content mapping
CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL DEFAULT '',
  file_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  signature TEXT,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  parent_symbol TEXT,
  visibility TEXT,
  doc_comment TEXT,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- FTS5 virtual table for full-text search on symbols
CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
  name,
  signature,
  doc_comment,
  kind,
  content=symbols,
  content_rowid=id,
  tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
  INSERT INTO symbols_fts(rowid, name, signature, doc_comment, kind)
  VALUES (new.id, new.name, new.signature, new.doc_comment, new.kind);
END;

CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
  INSERT INTO symbols_fts(symbols_fts, rowid, name, signature, doc_comment, kind)
  VALUES ('delete', old.id, old.name, old.signature, old.doc_comment, old.kind);
END;

CREATE TRIGGER IF NOT EXISTS symbols_au AFTER UPDATE ON symbols BEGIN
  INSERT INTO symbols_fts(symbols_fts, rowid, name, signature, doc_comment, kind)
  VALUES ('delete', old.id, old.name, old.signature, old.doc_comment, old.kind);
  INSERT INTO symbols_fts(rowid, name, signature, doc_comment, kind)
  VALUES (new.id, new.name, new.signature, new.doc_comment, new.kind);
END;

-- Module groupings with pattern metadata
-- SA4E-41: project_id scopes modules; uniqueness is per-tenant
CREATE TABLE IF NOT EXISTS modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  language TEXT,
  description TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  symbol_count INTEGER NOT NULL DEFAULT 0,
  di_style TEXT DEFAULT NULL,
  error_handling TEXT DEFAULT NULL,
  naming_convention TEXT DEFAULT NULL,
  logging_framework TEXT DEFAULT NULL,
  testing_framework TEXT DEFAULT NULL,
  purpose TEXT DEFAULT NULL,
  UNIQUE(project_id, name)
);

-- Optional embeddings for semantic search
-- SA4E-41: project_id scopes embeddings to a tenant
CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL DEFAULT '',
  symbol_id INTEGER,
  file_id INTEGER,
  vector BLOB NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_files_path ON files(relative_path);
CREATE INDEX IF NOT EXISTS idx_files_module ON files(module);
CREATE INDEX IF NOT EXISTS idx_files_language ON files(language);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
CREATE INDEX IF NOT EXISTS idx_embeddings_symbol ON embeddings(symbol_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_file ON embeddings(file_id);

-- SA4E-41: per-tenant scope indexes for fast isolated reads
CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_symbols_project ON symbols(project_id);
CREATE INDEX IF NOT EXISTS idx_symbols_proj_kind ON symbols(project_id, kind);
CREATE INDEX IF NOT EXISTS idx_modules_project ON modules(project_id);

-- MCP Tools
CREATE TABLE IF NOT EXISTS mcp_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  category TEXT,
  vector BLOB
);

-- Per-tool usage counters (SA4E-18)
CREATE TABLE IF NOT EXISTS tool_usage (
  tool_name      TEXT PRIMARY KEY,
  call_count     INTEGER NOT NULL DEFAULT 0,
  last_called_at TEXT
);

-- MEMORY TABLES
${MEMORY_SCHEMA}
`;
