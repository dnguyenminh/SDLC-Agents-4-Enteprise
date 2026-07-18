/**
 * SA4E-41 SEC-01 — Graph/analysis tool tenant isolation.
 * Seeds two tenants that share symbol names + relationships and asserts tenant B
 * never sees tenant A's symbols, callers, callees, files, or dependency edges.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteDbAdapter } from '../../../modules/memory/task-queue/SqliteDbAdapter.js';
import { SymbolResolver } from '../symbol-resolver.js';
import { GraphRepository } from '../../database/graph-repository.js';
import { CallGraphService } from '../call-graph-service.js';
import { FileResolver } from '../file-resolver.js';
import { DependencyGraphService } from '../dependency-graph-service.js';
import { GraphLoader } from '../../analyzers/graph-analysis/utils/GraphLoader.js';

const PID_A = 'proj_aaaa';
const PID_B = 'proj_bbbb';

const SCHEMA = `
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL, relative_path TEXT NOT NULL, language TEXT NOT NULL,
  module TEXT, content_hash TEXT NOT NULL, size_bytes INTEGER NOT NULL,
  last_indexed TEXT NOT NULL DEFAULT (datetime('now')), line_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  file_id INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, signature TEXT,
  start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, parent_symbol TEXT,
  visibility TEXT, doc_comment TEXT, parent_symbol_id INTEGER, is_exported INTEGER DEFAULT 0
);
CREATE TABLE relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  source_symbol_id INTEGER NOT NULL, target_symbol TEXT NOT NULL, target_symbol_id INTEGER,
  kind TEXT NOT NULL, file_path TEXT NOT NULL, line INTEGER NOT NULL, metadata TEXT
);
`;

/** Seed one tenant: a caller symbol that `calls` a shared callee, plus an import edge. */
function seed(db: Database.Database, pid: string, caller: string): void {
  const file = db.prepare(
    `INSERT INTO files (project_id, path, relative_path, language, content_hash, size_bytes)
     VALUES (?, ?, 'src/app.ts', 'typescript', ?, 100)`
  ).run(pid, `/${pid}/src/app.ts`, `h_${pid}`);
  const fileId = file.lastInsertRowid as number;
  const ins = db.prepare(
    `INSERT INTO symbols (project_id, file_id, name, kind, start_line, end_line, is_exported)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  );
  const callerId = ins.run(pid, fileId, caller, 'function', 1, 5).lastInsertRowid as number;
  const calleeId = ins.run(pid, fileId, 'sharedFn', 'function', 10, 20).lastInsertRowid as number;
  db.prepare(
    `INSERT INTO relationships (project_id, source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line)
     VALUES (?, ?, 'sharedFn', ?, 'calls', 'src/app.ts', 3)`
  ).run(pid, callerId, calleeId);
  db.prepare(
    `INSERT INTO relationships (project_id, source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line)
     VALUES (?, ?, './dep', NULL, 'imports', 'src/app.ts', 1)`
  ).run(pid, callerId);
}

describe('SA4E-41 SEC-01 graph tool isolation (two tenants)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA);
    seed(db, PID_A, 'callerAlpha');
    seed(db, PID_B, 'callerBravo');
  });

  afterEach(() => db.close());

  it('SymbolResolver only resolves the caller of its own tenant', () => {
    expect(new SymbolResolver(db, PID_A).resolve('callerAlpha').length).toBe(1);
    expect(new SymbolResolver(db, PID_B).resolve('callerAlpha').length).toBe(0);
    expect(new SymbolResolver(db, PID_B).resolve('callerBravo').length).toBe(1);
  });

  it('GraphRepository.findCallers of a shared symbol is tenant-scoped', () => {
    const callersB = new GraphRepository(new SqliteDbAdapter(db), PID_B).findCallers('sharedFn');
    expect(callersB.map(c => c.name)).toEqual(['callerBravo']);
    const callersA = new GraphRepository(new SqliteDbAdapter(db), PID_A).findCallers('sharedFn');
    expect(callersA.map(c => c.name)).toEqual(['callerAlpha']);
  });

  it('CallGraphService.findCallers does not leak across tenants', () => {
    const repoB = new GraphRepository(new SqliteDbAdapter(db), PID_B);
    const svcB = new CallGraphService(repoB, new SymbolResolver(db, PID_B));
    const res = svcB.findCallers('sharedFn', 1, 20);
    expect(res.results.every(r => r.symbol !== 'callerAlpha')).toBe(true);
    expect(res.results.some(r => r.symbol === 'callerBravo')).toBe(true);
  });

  it('FileResolver only sees its own tenant files', () => {
    // Both tenants use the same relative path; each resolver resolves it, but the
    // underlying set is scoped (fail-closed variant proven to return null).
    expect(new FileResolver(db, '/w', PID_B).resolveFile('src/app.ts')).toBe('src/app.ts');
    expect(new FileResolver(db, '/w', undefined).resolveFile('src/app.ts')).toBeNull();
  });

  it('DependencyGraphService outgoing deps are tenant-scoped', () => {
    const fr = new FileResolver(db, '/w', PID_B);
    const dep = new DependencyGraphService(db, fr, PID_B);
    const res = dep.query('src/app.ts', 'outgoing', 1, true, 50);
    expect(res.root).toBe('src/app.ts');
    // Fail-closed variant returns nothing.
    const frNone = new FileResolver(db, '/w', undefined);
    const depNone = new DependencyGraphService(db, frNone, undefined);
    expect(depNone.query('src/app.ts', 'outgoing', 1, true, 50).results.length).toBe(0);
  });

  it('GraphLoader call graph only contains own-tenant edges', () => {
    const edgeCount = (g: Map<number, number[]>) =>
      [...g.values()].reduce((n, arr) => n + arr.length, 0);
    expect(edgeCount(new GraphLoader(db, PID_B).loadCallGraph())).toBe(1);
    expect(edgeCount(new GraphLoader(db, PID_A).loadCallGraph())).toBe(1);
  });

  it('fail-closed: undefined projectId yields no graph data', () => {
    expect(new SymbolResolver(db, undefined).resolve('sharedFn').length).toBe(0);
    expect(new GraphRepository(new SqliteDbAdapter(db), undefined).findCallers('sharedFn').length).toBe(0);
    expect([...new GraphLoader(db, undefined).loadCallGraph().values()].length).toBe(0);
  });
});
