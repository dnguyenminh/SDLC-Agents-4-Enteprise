/**
 * SA4E-91 — Tests for CodeEdgeExtractor strategies.
 * Verifies MembershipEdgeStrategy CONTAINS edges and extractAndInsertCodeEdges integration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import pino from 'pino';
import { SqliteDbAdapter } from '../../../modules/memory/task-queue/SqliteDbAdapter.js';
import { MembershipEdgeStrategy, extractAndInsertCodeEdges } from '../code-edge-extractor.js';

const PID = 'proj_test';
const log = pino({ level: 'silent' });

const INDEX_SCHEMA = `
CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '', path TEXT, relative_path TEXT);
CREATE TABLE symbols (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '', file_id INTEGER, name TEXT, kind TEXT, parent_symbol TEXT);
CREATE TABLE relationships (project_id TEXT NOT NULL, source_symbol_id INTEGER, target_symbol_id INTEGER, target_symbol TEXT, kind TEXT);
`;

const ADMIN_SCHEMA = `
CREATE TABLE graph_nodes (entry_id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT 'DOCUMENT', tier TEXT NOT NULL DEFAULT 'SHARED', project_id TEXT NOT NULL DEFAULT '');
CREATE TABLE graph_edges (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, target TEXT NOT NULL, weight REAL NOT NULL DEFAULT 0.5, rel_type TEXT NOT NULL DEFAULT 'RELATED_TO', UNIQUE(source, target));
`;

describe('SA4E-91 CodeEdgeExtractor', () => {
  let indexDb: SqliteAdapter;
  let adminDb: SqliteAdapter;

  beforeEach(async () => {
    indexDb = new SqliteAdapter(':memory:');
    await indexDb.connect();
    await indexDb.exec(INDEX_SCHEMA);
    adminDb = new SqliteAdapter(':memory:');
    await adminDb.connect();
    await adminDb.exec(ADMIN_SCHEMA);
  });

  afterEach(async () => { await indexDb.disconnect(); await adminDb.disconnect(); });

  describe('MembershipEdgeStrategy', () => {
    it('creates CONTAINS edges from parent_symbol name match same file', async () => {
      await indexDb.run(`INSERT INTO files (project_id, path, relative_path) VALUES (?, '/a.ts', 'a.ts')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind) VALUES (?, 1, 'MyClass', 'class')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind, parent_symbol) VALUES (?, 1, 'myMethod', 'method', 'MyClass')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind, parent_symbol) VALUES (?, 1, 'myProp', 'property', 'MyClass')`, [PID]);

      const strategy = new MembershipEdgeStrategy();
      const edges = await strategy.extract(new SqliteDbAdapter(indexDb), PID);

      expect(edges).toHaveLength(2);
      expect(edges).toEqual(
        expect.arrayContaining([
          { source: 'code:1', target: 'code:2', label: 'CONTAINS', weight: 0.5 },
          { source: 'code:1', target: 'code:3', label: 'CONTAINS', weight: 0.5 },
        ])
      );
    });

    it('does not create edge when parent_symbol is null', async () => {
      await indexDb.run(`INSERT INTO files (project_id, path, relative_path) VALUES (?, '/a.ts', 'a.ts')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind) VALUES (?, 1, 'Orphan', 'method')`, [PID]);

      const strategy = new MembershipEdgeStrategy();
      const edges = await strategy.extract(new SqliteDbAdapter(indexDb), PID);
      expect(edges).toHaveLength(0);
    });
  });

  describe('extractAndInsertCodeEdges integration', () => {
    it('inserts CONTAINS edges into graph_edges', async () => {
      await indexDb.run(`INSERT INTO files (project_id, path, relative_path) VALUES (?, '/a.ts', 'a.ts')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind) VALUES (?, 1, 'MyClass', 'class')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind, parent_symbol) VALUES (?, 1, 'myMethod', 'method', 'MyClass')`, [PID]);

      const count = await extractAndInsertCodeEdges(new SqliteDbAdapter(indexDb), new SqliteDbAdapter(adminDb), PID, log);
      expect(count).toBeGreaterThanOrEqual(1);

      const edges = await adminDb.all('SELECT * FROM graph_edges') as any[];
      expect(edges.some((e: any) => e.rel_type === 'CONTAINS')).toBe(true);
    });

    it('is idempotent — duplicate inserts ignored', async () => {
      await indexDb.run(`INSERT INTO files (project_id, path, relative_path) VALUES (?, '/a.ts', 'a.ts')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind) VALUES (?, 1, 'MyClass', 'class')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind, parent_symbol) VALUES (?, 1, 'myMethod', 'method', 'MyClass')`, [PID]);

      await extractAndInsertCodeEdges(new SqliteDbAdapter(indexDb), new SqliteDbAdapter(adminDb), PID, log);
      await extractAndInsertCodeEdges(new SqliteDbAdapter(indexDb), new SqliteDbAdapter(adminDb), PID, log);

      const edges = await adminDb.all('SELECT * FROM graph_edges') as any[];
      expect(edges.length).toBe(1);
    });
  });
});
