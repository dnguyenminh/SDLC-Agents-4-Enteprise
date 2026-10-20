/**
 * Shared fixtures for the KBGraphModule test suites.
 * (Split from KBGraphModule.test.ts — BR-18 ≤200 lines/file.)
 */
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { GraphService } from '../service/index.js';
import { KBGraphModule } from '../KBGraphModule.js';
import pino from 'pino';

export const GRAPH_SCHEMA = `
CREATE TABLE IF NOT EXISTS graph_nodes (
  entry_id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'DOCUMENT', tier TEXT NOT NULL DEFAULT 'SHARED',
  project_id TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, z REAL NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 2, cluster_id TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS graph_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL, target TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0.5, rel_type TEXT NOT NULL DEFAULT 'RELATED_TO',
  UNIQUE(source, target)
);
`;

export const log = pino({ level: 'silent' }) as any;

/** Fresh in-memory graph module wired to a GraphService over the same adapter. */
export async function createGraphModule(): Promise<{ adapter: SqliteAdapter; module: KBGraphModule }> {
  const adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  await adapter.exec(GRAPH_SCHEMA);
  const svc = new GraphService(adapter as any, log);
  const module = new (class extends KBGraphModule {
    constructor() {
      super(log);
      (this as any).graphService = svc;
    }
    async initialize() { (this as any)._status = 'ready'; }
  })();
  return { adapter, module };
}

/** Test fixture shorthand for the repeated node INSERT. */
export function insertNode(
  adapter: SqliteAdapter,
  entryId: string, label: string, type: string, tier: string, projectId = '',
): void {
  adapter.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id, x, y, z, level)
    VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0)`).run(entryId, label, type, tier, projectId);
}

/** Test fixture shorthand for the repeated edge INSERT. */
export function insertEdge(
  adapter: SqliteAdapter,
  source: string, target: string, weight = 0.5, relType?: string,
): void {
  if (relType) {
    adapter.prepare(`INSERT INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?)`)
      .run(source, target, weight, relType);
  } else {
    adapter.prepare(`INSERT INTO graph_edges (source, target, weight) VALUES (?, ?, ?)`)
      .run(source, target, weight);
  }
}
