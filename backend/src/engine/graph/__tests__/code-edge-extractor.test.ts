/**
 * SA4E-91 — Tests for CodeEdgeExtractor strategies.
 * Verifies IMPORTS, CALLS, and EXTENDS edges are extracted from code_dependencies,
 * code_call_graph, and symbols tables, then inserted into graph_edges.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import pino from 'pino';
import { SqliteDbAdapter } from '../../../modules/memory/task-queue/SqliteDbAdapter.js';
import {
  ImportsEdgeStrategy,
  CallsEdgeStrategy,
  ExtendsEdgeStrategy,
  extractAndInsertCodeEdges,
} from '../code-edge-extractor.js';

const PID = 'proj_test';
const log = pino({ level: 'silent' });

const INDEX_SCHEMA = `
CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  path TEXT, relative_path TEXT, language TEXT, module TEXT, content_hash TEXT, size_bytes INTEGER, line_count INTEGER);
CREATE TABLE symbols (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  file_id INTEGER, name TEXT, kind TEXT, signature TEXT, start_line INTEGER, end_line INTEGER,
  parent_symbol TEXT, parent_symbol_id INTEGER, visibility TEXT, doc_comment TEXT, complexity INTEGER, is_exported INTEGER DEFAULT 0);
CREATE TABLE code_dependencies (id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_file_id INTEGER NOT NULL, target_file_id INTEGER, target_path TEXT NOT NULL DEFAULT '',
  dependency_type TEXT NOT NULL DEFAULT 'import');
CREATE TABLE code_call_graph (id INTEGER PRIMARY KEY AUTOINCREMENT,
  caller_symbol_id INTEGER NOT NULL, callee_symbol_id INTEGER NOT NULL, call_site_line INTEGER);
`;

const ADMIN_SCHEMA = `
CREATE TABLE graph_nodes (entry_id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'DOCUMENT', tier TEXT NOT NULL DEFAULT 'SHARED', project_id TEXT NOT NULL DEFAULT '',
  x REAL DEFAULT 0, y REAL DEFAULT 0, z REAL DEFAULT 0, level INTEGER DEFAULT 2, cluster_id TEXT,
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE graph_edges (id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL, target TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0.5, rel_type TEXT NOT NULL DEFAULT 'RELATED_TO',
  UNIQUE(source, target));
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

  describe('ImportsEdgeStrategy', () => {
    it('extracts IMPORTS edges from code_dependencies', async () => {
      await indexDb.run(`INSERT INTO files (project_id, path, relative_path) VALUES (?, '/a.ts', 'a.ts')`, [PID]);
      await indexDb.run(`INSERT INTO files (project_id, path, relative_path) VALUES (?, '/b.ts', 'b.ts')`, [PID]);
      await indexDb.run(`INSERT INTO code_dependencies (source_file_id, target_file_id, target_path) VALUES (1, 2, './b')`);

      const strategy = new ImportsEdgeStrategy();
      const edges = await strategy.extract(new SqliteDbAdapter(indexDb), PID);

      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({ source: 'code:1', target: 'code:2', label: 'IMPORTS', weight: 0.8 });
    });

    it('skips dependencies with null target_file_id', async () => {
      await indexDb.run(`INSERT INTO files (project_id, path, relative_path) VALUES (?, '/a.ts', 'a.ts')`, [PID]);
      await indexDb.run(`INSERT INTO code_dependencies (source_file_id, target_file_id, target_path) VALUES (1, NULL, 'lodash')`);

      const strategy = new ImportsEdgeStrategy();
      const edges = await strategy.extract(new SqliteDbAdapter(indexDb), PID);

      expect(edges).toHaveLength(0);
    });
  });

  describe('CallsEdgeStrategy', () => {
    it('extracts CALLS edges from code_call_graph', async () => {
      await indexDb.run(`INSERT INTO files (project_id, path, relative_path) VALUES (?, '/x.ts', 'x.ts')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind) VALUES (?, 1, 'foo', 'function')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind) VALUES (?, 1, 'bar', 'function')`, [PID]);
      await indexDb.run(`INSERT INTO code_call_graph (caller_symbol_id, callee_symbol_id, call_site_line) VALUES (1, 2, 10)`);

      const strategy = new CallsEdgeStrategy();
      const edges = await strategy.extract(new SqliteDbAdapter(indexDb), PID);

      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({ source: 'code:1', target: 'code:2', label: 'CALLS', weight: 0.7 });
    });
  });

  describe('ExtendsEdgeStrategy', () => {
    it('extracts EXTENDS edges from parent_symbol_id', async () => {
      await indexDb.run(`INSERT INTO files (project_id, path, relative_path) VALUES (?, '/c.ts', 'c.ts')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind, parent_symbol_id) VALUES (?, 1, 'Base', 'class', NULL)`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind, parent_symbol_id) VALUES (?, 1, 'Child', 'class', 1)`, [PID]);

      const strategy = new ExtendsEdgeStrategy();
      const edges = await strategy.extract(new SqliteDbAdapter(indexDb), PID);

      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({ source: 'code:2', target: 'code:1', label: 'EXTENDS', weight: 0.9 });
    });
  });

  describe('extractAndInsertCodeEdges (integration)', () => {
    it('inserts all edge types into graph_edges', async () => {
      // File A=1 imports File B=2, but Symbol X=3 (in file A) calls Symbol Y=4 (in file B)
      await indexDb.run(`INSERT INTO files (project_id, path, relative_path) VALUES (?, '/a.ts', 'a.ts')`, [PID]);
      await indexDb.run(`INSERT INTO files (project_id, path, relative_path) VALUES (?, '/b.ts', 'b.ts')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind) VALUES (?, 1, 'fn1', 'function')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind) VALUES (?, 1, 'fn2', 'function')`, [PID]);
      await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind) VALUES (?, 2, 'fn3', 'function')`, [PID]);
      // File 1 → File 2 (IMPORTS edge: code:1 → code:2)
      await indexDb.run(`INSERT INTO code_dependencies (source_file_id, target_file_id, target_path) VALUES (1, 2, './b')`);
      // Symbol 2 → Symbol 3 (CALLS edge: code:2 → code:3)
      await indexDb.run(`INSERT INTO code_call_graph (caller_symbol_id, callee_symbol_id, call_site_line) VALUES (2, 3, 10)`);

      const count = await extractAndInsertCodeEdges(
        new SqliteDbAdapter(indexDb), new SqliteDbAdapter(adminDb), PID, log,
      );

      expect(count).toBe(2);
      const edges = await adminDb.all('SELECT * FROM graph_edges ORDER BY rel_type') as any[];
      expect(edges).toHaveLength(2);
      expect(edges.some((e: any) => e.rel_type === 'IMPORTS')).toBe(true);
      expect(edges.some((e: any) => e.rel_type === 'CALLS')).toBe(true);
    });

    it('is idempotent — duplicate inserts ignored', async () => {
      await indexDb.run(`INSERT INTO files (project_id, path, relative_path) VALUES (?, '/a.ts', 'a.ts')`, [PID]);
      await indexDb.run(`INSERT INTO files (project_id, path, relative_path) VALUES (?, '/b.ts', 'b.ts')`, [PID]);
      await indexDb.run(`INSERT INTO code_dependencies (source_file_id, target_file_id, target_path) VALUES (1, 2, './b')`);

      await extractAndInsertCodeEdges(new SqliteDbAdapter(indexDb), new SqliteDbAdapter(adminDb), PID, log);
      await extractAndInsertCodeEdges(new SqliteDbAdapter(indexDb), new SqliteDbAdapter(adminDb), PID, log);

      const edges = await adminDb.all('SELECT * FROM graph_edges') as any[];
      expect(edges.length).toBe(1);
    });
  });
});
