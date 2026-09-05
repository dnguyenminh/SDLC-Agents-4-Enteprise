/**
 * SA4E-91 — Tests for edge-on-ingest extraction strategies.
 * Verifies DISCUSSES, REFERENCES, and BELONGS_TO edges are created
 * when KB entries are ingested.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../task-queue/SqliteDbAdapter.js';
import {
  TicketRefStrategy,
  FilePathRefStrategy,
  ClassNameRefStrategy,
  BelongsToStrategy,
  extractAndInsertIngestEdges,
  type NodeLabel,
} from '../engine/edge-on-ingest.js';

const SCHEMA = `
CREATE TABLE graph_nodes (entry_id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'DOCUMENT', tier TEXT NOT NULL DEFAULT 'SHARED', project_id TEXT NOT NULL DEFAULT '',
  x REAL DEFAULT 0, y REAL DEFAULT 0, z REAL DEFAULT 0, level INTEGER DEFAULT 2, cluster_id TEXT,
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE graph_edges (id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL, target TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0.5, rel_type TEXT NOT NULL DEFAULT 'RELATED_TO',
  UNIQUE(source, target));
`;

describe('SA4E-91 Edge-on-Ingest', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.exec(SCHEMA);
    // Seed some existing nodes for matching
    await adapter.run(`INSERT INTO graph_nodes (entry_id, label, type) VALUES (?, ?, ?)`, ['kb-entry:1', 'SA4E-50 Feature BRD', 'DOCUMENT']);
    await adapter.run(`INSERT INTO graph_nodes (entry_id, label, type) VALUES (?, ?, ?)`, ['code:42', 'GraphService (graph-service.ts)', 'CODE_ENTITY']);
    await adapter.run(`INSERT INTO graph_nodes (entry_id, label, type) VALUES (?, ?, ?)`, ['kb-entry:5', 'crud.ts analysis', 'KNOWLEDGE_ENTRY']);
  });

  afterEach(async () => { await adapter.disconnect(); });

  const nodes: NodeLabel[] = [
    { entry_id: 'kb-entry:1', label: 'SA4E-50 Feature BRD' },
    { entry_id: 'code:42', label: 'GraphService (graph-service.ts)' },
    { entry_id: 'kb-entry:5', label: 'crud.ts analysis' },
  ];

  describe('TicketRefStrategy', () => {
    it('creates DISCUSSES edge for ticket key references', () => {
      const strategy = new TicketRefStrategy();
      const edges = strategy.extract(
        { entryId: 'kb-entry:99', content: 'This relates to SA4E-50 implementation' },
        nodes,
      );
      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        source: 'kb-entry:99', target: 'kb-entry:1', label: 'DISCUSSES', weight: 0.5,
      });
    });

    it('does not self-reference', () => {
      const strategy = new TicketRefStrategy();
      const edges = strategy.extract(
        { entryId: 'kb-entry:1', content: 'SA4E-50 is the current entry' },
        nodes,
      );
      expect(edges).toHaveLength(0);
    });

    it('returns empty for no ticket matches', () => {
      const strategy = new TicketRefStrategy();
      const edges = strategy.extract({ entryId: 'kb-entry:99', content: 'No tickets here' }, nodes);
      expect(edges).toHaveLength(0);
    });
  });

  describe('FilePathRefStrategy', () => {
    it('creates REFERENCES edge for file path mentions', () => {
      const strategy = new FilePathRefStrategy();
      const edges = strategy.extract(
        { entryId: 'kb-entry:99', content: 'Modified crud.ts to fix the bug' },
        nodes,
      );
      expect(edges).toHaveLength(1);
      expect(edges[0].label).toBe('REFERENCES');
      expect(edges[0].target).toBe('kb-entry:5');
    });
  });

  describe('ClassNameRefStrategy', () => {
    it('creates REFERENCES edge for PascalCase class names', () => {
      const strategy = new ClassNameRefStrategy();
      const edges = strategy.extract(
        { entryId: 'kb-entry:99', content: 'The GraphService handles node sync' },
        nodes,
      );
      expect(edges).toHaveLength(1);
      expect(edges[0].label).toBe('REFERENCES');
      expect(edges[0].target).toBe('code:42');
    });
  });

  describe('BelongsToStrategy', () => {
    it('creates BELONGS_TO edge from source field', () => {
      const strategy = new BelongsToStrategy();
      const edges = strategy.extract(
        { entryId: 'kb-entry:99', content: 'Some content', source: 'crud.ts' },
        nodes,
      );
      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        source: 'kb-entry:99', target: 'kb-entry:5', label: 'BELONGS_TO', weight: 0.6,
      });
    });

    it('returns empty when source is null', () => {
      const strategy = new BelongsToStrategy();
      const edges = strategy.extract(
        { entryId: 'kb-entry:99', content: 'content', source: null },
        nodes,
      );
      expect(edges).toHaveLength(0);
    });
  });

  describe('extractAndInsertIngestEdges (integration)', () => {
    it('inserts edges into graph_edges table', async () => {
      const count = await extractAndInsertIngestEdges(
        new SqliteDbAdapter(adapter),
        { entryId: 'kb-entry:99', content: 'SA4E-50 uses GraphService in crud.ts', source: null },
      );

      expect(count).toBeGreaterThanOrEqual(1);
      const edges = await adapter.all('SELECT * FROM graph_edges') as any[];
      expect(edges.length).toBeGreaterThanOrEqual(1);
    });

    it('is idempotent — no duplicate edges', async () => {
      const dbAdapter = new SqliteDbAdapter(adapter);
      const ctx = { entryId: 'kb-entry:99', content: 'SA4E-50 feature', source: null };

      await extractAndInsertIngestEdges(dbAdapter, ctx);
      await extractAndInsertIngestEdges(dbAdapter, ctx);

      const edges = await adapter.all('SELECT * FROM graph_edges') as any[];
      // UNIQUE constraint prevents duplicates
      const unique = new Set(edges.map((e: any) => `${e.source}-${e.target}`));
      expect(unique.size).toBe(edges.length);
    });

    it('returns 0 when no graph_nodes exist', async () => {
      const emptyAdapter = new SqliteAdapter(':memory:');
      await emptyAdapter.connect();
      await emptyAdapter.exec(SCHEMA);

      const count = await extractAndInsertIngestEdges(
        new SqliteDbAdapter(emptyAdapter),
        { entryId: 'kb-entry:1', content: 'SA4E-50 test' },
      );

      expect(count).toBe(0);
      await emptyAdapter.disconnect();
    });
  });
});
