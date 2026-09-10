/**
 * SA4E-250 — Tests for edge-on-ingest extraction strategies.
 * Verifies DISCUSSES, REFERENCES, and BELONGS_TO edges are created
 * when KB entries are ingested using knowledge_graph_edges with integer IDs.
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
  type NodeInfo,
} from '../engine/edge-on-ingest.js';

const SCHEMA = `
CREATE TABLE knowledge_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  source TEXT,
  tags TEXT,
  project_id TEXT
);
CREATE TABLE knowledge_graph_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  relation TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  UNIQUE(source_id, target_id, relation)
);
`;

describe('SA4E-250 Edge-on-Ingest (integer IDs, project filter, pagination)', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.exec(SCHEMA);
    // Seed some existing nodes for matching
    await adapter.run(`INSERT INTO knowledge_entries (id, content, source, tags, project_id) VALUES (?, ?, ?, ?, ?)`, [1, 'SA4E-50 Feature BRD content', 'file1.md', '', 'proj1']);
    await adapter.run(`INSERT INTO knowledge_entries (id, content, source, tags, project_id) VALUES (?, ?, ?, ?, ?)`, [2, 'GraphService handles node sync', 'graph-service.ts', '', 'proj1']);
    await adapter.run(`INSERT INTO knowledge_entries (id, content, source, tags, project_id) VALUES (?, ?, ?, ?, ?)`, [5, 'crud.ts analysis content', 'crud.ts', '', 'proj1']);
  });

  afterEach(async () => { await adapter.disconnect(); });

  const nodes: NodeInfo[] = [
    { id: 1, content: 'SA4E-50 Feature BRD content', source: 'file1.md', tags: '' },
    { id: 2, content: 'GraphService handles node sync', source: 'graph-service.ts', tags: '' },
    { id: 5, content: 'crud.ts analysis content', source: 'crud.ts', tags: '' },
  ];

  describe('TicketRefStrategy', () => {
    it('creates DISCUSSES edge for ticket key references', () => {
      const strategy = new TicketRefStrategy();
      const edges = strategy.extract(
        { entryId: 99, content: 'This relates to SA4E-50 implementation', projectId: 'proj1' },
        nodes,
      );
      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        sourceId: 99, targetId: 1, label: 'DISCUSSES', weight: 0.5,
      });
    });

    it('does not self-reference', () => {
      const strategy = new TicketRefStrategy();
      const edges = strategy.extract(
        { entryId: 1, content: 'SA4E-50 is the current entry', projectId: 'proj1' },
        nodes,
      );
      expect(edges).toHaveLength(0);
    });

    it('returns empty for no ticket matches', () => {
      const strategy = new TicketRefStrategy();
      const edges = strategy.extract({ entryId: 99, content: 'No tickets here', projectId: 'proj1' }, nodes);
      expect(edges).toHaveLength(0);
    });
  });

  describe('FilePathRefStrategy', () => {
    it('creates REFERENCES edge for file path mentions', () => {
      const strategy = new FilePathRefStrategy();
      const edges = strategy.extract(
        { entryId: 99, content: 'Modified crud.ts to fix the bug', projectId: 'proj1' },
        nodes,
      );
      expect(edges).toHaveLength(1);
      expect(edges[0].label).toBe('REFERENCES');
      expect(edges[0].targetId).toBe(5);
    });
  });

  describe('ClassNameRefStrategy', () => {
    it('creates REFERENCES edge for PascalCase class names', () => {
      const strategy = new ClassNameRefStrategy();
      const edges = strategy.extract(
        { entryId: 99, content: 'The GraphService handles node sync', projectId: 'proj1' },
        nodes,
      );
      expect(edges).toHaveLength(1);
      expect(edges[0].label).toBe('REFERENCES');
      expect(edges[0].targetId).toBe(2);
    });
  });

  describe('BelongsToStrategy', () => {
    it('creates BELONGS_TO edge from source field', () => {
      const strategy = new BelongsToStrategy();
      const edges = strategy.extract(
        { entryId: 99, content: 'Some content', source: 'crud.ts', projectId: 'proj1' },
        nodes,
      );
      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        sourceId: 99, targetId: 5, label: 'BELONGS_TO', weight: 0.6,
      });
    });

    it('returns empty when source is null', () => {
      const strategy = new BelongsToStrategy();
      const edges = strategy.extract(
        { entryId: 99, content: 'content', source: null, projectId: 'proj1' },
        nodes,
      );
      expect(edges).toHaveLength(0);
    });
  });

  describe('extractAndInsertIngestEdges (integration)', () => {
    it('inserts edges into knowledge_graph_edges table', async () => {
      // Insert a new entry to be the source
      await adapter.run(`INSERT INTO knowledge_entries (id, content, source, tags, project_id) VALUES (?, ?, ?, ?, ?)`, [99, 'SA4E-50 uses GraphService in crud.ts', null, '', 'proj1']);

      const count = await extractAndInsertIngestEdges(
        new SqliteDbAdapter(adapter),
        { entryId: 99, content: 'SA4E-50 uses GraphService in crud.ts', source: null, projectId: 'proj1' },
      );

      expect(count).toBeGreaterThanOrEqual(1);
      const edges = await adapter.all('SELECT * FROM knowledge_graph_edges') as any[];
      expect(edges.length).toBeGreaterThanOrEqual(1);
      // Verify integer IDs
      expect(typeof edges[0].source_id).toBe('number');
      expect(typeof edges[0].target_id).toBe('number');
    });

    it('is idempotent — no duplicate edges', async () => {
      await adapter.run(`INSERT INTO knowledge_entries (id, content, source, tags, project_id) VALUES (?, ?, ?, ?, ?)`, [99, 'SA4E-50 feature', null, '', 'proj1']);
      const dbAdapter = new SqliteDbAdapter(adapter);
      const ctx = { entryId: 99, content: 'SA4E-50 feature', source: null, projectId: 'proj1' };

      await extractAndInsertIngestEdges(dbAdapter, ctx);
      await extractAndInsertIngestEdges(dbAdapter, ctx);

      const edges = await adapter.all('SELECT * FROM knowledge_graph_edges') as any[];
      const unique = new Set(edges.map((e: any) => `${e.source_id}-${e.target_id}-${e.relation}`));
      expect(unique.size).toBe(edges.length);
    });

    it('respects project filter', async () => {
      await adapter.run(`INSERT INTO knowledge_entries (id, content, source, tags, project_id) VALUES (?, ?, ?, ?, ?)`, [99, 'SA4E-50 content', null, '', 'proj2']);
      const count = await extractAndInsertIngestEdges(
        new SqliteDbAdapter(adapter),
        { entryId: 99, content: 'SA4E-50 content', source: null, projectId: 'proj2' },
      );
      // No matching nodes in proj2, so no edges
      expect(count).toBe(0);
    });

    it('returns 0 when no knowledge_entries exist', async () => {
      const emptyAdapter = new SqliteAdapter(':memory:');
      await emptyAdapter.connect();
      await emptyAdapter.exec(SCHEMA);

      const count = await extractAndInsertIngestEdges(
        new SqliteDbAdapter(emptyAdapter),
        { entryId: 1, content: 'SA4E-50 test', projectId: 'proj1' },
      );

      expect(count).toBe(0);
      await emptyAdapter.disconnect();
    });
  });
});
