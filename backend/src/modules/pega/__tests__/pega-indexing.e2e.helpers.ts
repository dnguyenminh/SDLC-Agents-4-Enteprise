/**
 * Shared setup helpers for the Pega Indexing E2E test suites.
 * Extracted verbatim from the original pega-indexing.e2e.test.ts beforeAll.
 */

import { Hono } from 'hono';
import { createPegaApiRoutes } from '../../../server/routes/pega-api.js';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { ensureSa4e237Tables } from '../../../database/schema-registry/ensure-sa4e-237.js';
import { MemoryEngine } from '../../memory/engine/core.js';

/** Minimal SQLite schema covering the tables the Pega pipeline touches. */
export const E2E_SCHEMA = `
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT, summary TEXT, type TEXT, tier TEXT, scope TEXT,
  user_id TEXT, project_id TEXT, source TEXT, source_ref TEXT,
  tags TEXT, confidence REAL DEFAULT 1.0, agent_name TEXT, owner TEXT,
  enrichment_status TEXT, structured_map TEXT, archived INTEGER DEFAULT 0,
  expires_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ke_source_project_unique
  ON knowledge_entries(source, project_id) WHERE source IS NOT NULL;
CREATE TABLE IF NOT EXISTS pending_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT, entry_id INTEGER, status TEXT, payload TEXT,
  max_retries INTEGER DEFAULT 3, project_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  started_at TEXT, completed_at TEXT, error TEXT, retry_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT, path TEXT, relative_path TEXT, language TEXT, module TEXT,
  content_hash TEXT, size_bytes INTEGER, line_count INTEGER,
  UNIQUE(project_id, path)
);
CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT, file_id INTEGER, name TEXT, kind TEXT, signature TEXT,
  start_line INTEGER, end_line INTEGER, parent_symbol TEXT, visibility TEXT, doc_comment TEXT,
  enrichment_status TEXT, summary TEXT, pseudo_code TEXT, llm_tags TEXT,
  complexity INTEGER DEFAULT 0, is_exported INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS body_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT, symbol_id INTEGER, chunk_index INTEGER,
  embedding BLOB, token_count INTEGER,
  UNIQUE(project_id, symbol_id, chunk_index)
);
CREATE TABLE IF NOT EXISTS graph_nodes (
  entry_id TEXT PRIMARY KEY,
  label TEXT, type TEXT, tier TEXT,
  project_id TEXT, x REAL, y REAL, z REAL, level TEXT, cluster_id TEXT
);
`;

/**
 * Boots the in-memory Hono app + SQLite adapter used by the E2E suites.
 * Mirrors the original beforeAll hook verbatim.
 */
export async function setupPegaIndexingE2e(): Promise<{ app: Hono; adapter: SqliteAdapter }> {
  const adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  await adapter.execAsync(E2E_SCHEMA);
  // SA4E-237: bootstrap against THIS adapter (mirrors index.ts) so
  // stageRuleReferences does not fail with "no such table" under test.
  await ensureSa4e237Tables({ adapter, engine: 'sqlite' });
  const engine = new MemoryEngine(adapter);
  const mockRegistry = {
    getModule: (name: string) => {
      if (name === 'memory') {
        return { status: 'ready', getEngine: () => engine };
      }
      return null;
    },
  } as any;

  const mockLogger = { error: () => {}, info: () => {}, warn: () => {}, debug: () => {} } as any;
  const app = new Hono();
  // SA4E-241: mimic jwtAuth (anonymous mode) — inject projectContext from the
  // X-Project-Id header so identity-bound routes work under test.
  app.use('/api/v1/pega/*', async (c, next) => {
    const projectId = c.req.header('X-Project-Id') || '';
    c.set('projectContext' as never, { projectId, userId: 'anonymous' } as never);
    return next();
  });
  app.route('/api/v1', createPegaApiRoutes(mockRegistry, mockLogger));
  return { app, adapter };
}
