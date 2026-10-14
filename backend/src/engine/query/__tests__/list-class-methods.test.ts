/**
 * SA4E-360 F-3 regression guard (DEFECT-QA-01) — listClassMethods bind order
 * on REAL SQLite + real QueryLayer with projectId defined (pattern:
 * query-isolation.test.ts). Pre-fix (before commit 0d33706) the params bound
 * cls into the s.project_id placeholder slot, so AF-4 enrichment was silently
 * EMPTY for every scoped tenant. Scenario per QA verification:
 * documents/SA4E-360/evidence/f-fix-verification-2026-10-15.log §3.
 *
 * Discriminator: the positive assertions (F-3a..d) FAIL on pre-fix code — the
 * same seed returns [] — so the suite regresses if the bind order is reverted.
 * F-3e additionally replays the captured SQL with the pre-fix param order to
 * pin the bug signature ([] on this seed).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueryLayer } from '../query-layer.js';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

const PID_P1 = 'proj_one';
const PID_P2 = 'proj_two';

const SCHEMA = `
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL, relative_path TEXT NOT NULL, language TEXT NOT NULL,
  module TEXT, content_hash TEXT NOT NULL, size_bytes INTEGER NOT NULL,
  last_indexed TEXT NOT NULL DEFAULT (datetime('now')), line_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, path)
);
CREATE TABLE symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL DEFAULT '',
  file_id INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, signature TEXT,
  start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, parent_symbol TEXT,
  visibility TEXT, doc_comment TEXT
);
CREATE VIRTUAL TABLE symbols_fts USING fts5(name, signature, doc_comment, kind, content=symbols, content_rowid=id, tokenize='porter unicode61');
CREATE TRIGGER symbols_ai AFTER INSERT ON symbols BEGIN
  INSERT INTO symbols_fts(rowid, name, signature, doc_comment, kind) VALUES (new.id, new.name, new.signature, new.doc_comment, new.kind);
END;
CREATE TABLE modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
  root_path TEXT NOT NULL, language TEXT, description TEXT,
  file_count INTEGER NOT NULL DEFAULT 0, symbol_count INTEGER NOT NULL DEFAULT 0,
  di_style TEXT, error_handling TEXT, naming_convention TEXT, logging_framework TEXT,
  testing_framework TEXT, purpose TEXT, UNIQUE(project_id, name)
);
`;

/**
 * Seeds one tenant: a Parser class with the given methods, plus optionally a
 * same-file OtherClass method (F-3c file-membership semantics). The tenant-2
 * decoy uses a DISTINCT method name ('decoyParse') so a cross-tenant leak is
 * observable — with a same-name decoy, DISTINCT would mask the leak.
 */
function seedTenant(adapter: SqliteAdapter, pid: string, parserMethods: string[], otherMethod?: string): void {
  const fileRes = adapter.run(
    `INSERT INTO files (project_id, path, relative_path, language, module, content_hash, size_bytes, line_count)
     VALUES (?, ?, 'src/parser.ts', 'typescript', 'parser', ?, 200, 40)`,
    [pid, `/${pid}/src/parser.ts`, `hash_${pid}`]
  );
  const fileId = Number(fileRes.lastInsertRowid);
  const insertSymbol = (name: string, kind: string, parent: string | null, line: number): void => {
    adapter.run(
      `INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [pid, fileId, name, kind, `${name}(input: string): string`, line, line + 2, parent]
    );
  };
  insertSymbol('Parser', 'class', null, 1);
  parserMethods.forEach((m, i) => insertSymbol(m, 'method', 'Parser', 5 + i * 5));
  if (otherMethod) {
    insertSymbol('OtherClass', 'class', null, 40);
    insertSymbol(otherMethod, 'method', 'OtherClass', 45);
  }
}

/** Delegating adapter that records every allAsync call (for the F-3e replay). */
function withAllAsyncCapture(base: SqliteAdapter, calls: Array<{ sql: string; params: unknown[] }>): DatabaseAdapter {
  return new Proxy(base, {
    get(target, prop) {
      if (prop === 'allAsync') {
        return async (sql: string, params?: unknown[]) => {
          calls.push({ sql, params: [...(params ?? [])] });
          return target.allAsync(sql, params);
        };
      }
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

describe('SA4E-360 F-3 — listClassMethods on real SQLite (projectId defined)', () => {
  let adapter: SqliteAdapter;
  let ql: QueryLayer;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    adapter.exec(SCHEMA);
    seedTenant(adapter, PID_P1, ['parse', 'reset', 'tokenize'], 'unrelated');
    seedTenant(adapter, PID_P2, ['decoyParse', 'parse']);
    ql = new QueryLayer(adapter);
  });

  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  // F-3a — DISCRIMINATOR: pre-fix bind order returns [] on this seed; the fix
  // returns the 4 same-file method names alphabetically (non-empty enrichment).
  it('returns the same-file method names alphabetically when projectId is defined', async () => {
    const names = await ql.listClassMethods(PID_P1, 'Parser', 10);
    expect(names).toEqual(['parse', 'reset', 'tokenize', 'unrelated']);
  });

  // F-3b — tenant-scoped: p2 decoys never leak into p1, and each tenant gets
  // its own enrichment view (fail-closed scope, SA4E-41).
  it('is tenant-scoped: decoy methods of the other project never leak', async () => {
    const p1 = await ql.listClassMethods(PID_P1, 'Parser', 10);
    expect(p1).not.toContain('decoyParse');
    const p2 = await ql.listClassMethods(PID_P2, 'Parser', 10);
    expect(p2).toEqual(['decoyParse', 'parse']);
    expect(p2).not.toContain('reset');
  });

  // F-3c — same-file membership by design: OtherClass method in the SAME file
  // is included (AF-4 enrichment is per-file, not strictly per-parent).
  it('includes same-file methods of other classes (AF-4 file-membership semantics)', async () => {
    const names = await ql.listClassMethods(PID_P1, 'Parser', 10);
    expect(names).toContain('unrelated');
  });

  // F-3d — LIMIT is honored (bounded enrichment, clamped ≤ 50).
  it('honors the limit bound', async () => {
    const names = await ql.listClassMethods(PID_P1, 'Parser', 2);
    expect(names).toEqual(['parse', 'reset']);
    expect(names.length).toBeLessThanOrEqual(2);
  });

  // F-3e — pin the bug signature: the PRE-FIX param order ([cls, ...scope,
  // cls, ...subScope, bounded]) bound the class name into the s.project_id
  // slot → no row matches → silent empty. Replaying the captured SQL with
  // that order documents why the positive assertions above discriminate.
  it('pre-fix param order replay returns empty (documents the discriminator)', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const capture = new QueryLayer(withAllAsyncCapture(adapter, calls));
    const names = await capture.listClassMethods(PID_P1, 'Parser', 10);
    expect(names).toEqual(['parse', 'reset', 'tokenize', 'unrelated']);
    const listCall = calls.find((c) => c.sql.includes('DISTINCT s.name'));
    expect(listCall).toBeDefined();
    const params = listCall!.params;
    // Post-fix shape: [projectId, cls, cls, projectId, LIMIT] — assert slots
    // so the replay transformation below is well-founded.
    expect(params[0]).toBe(PID_P1);
    expect(params[1]).toBe('Parser');
    // Pre-fix order: [cls, projectId, cls, projectId, LIMIT] → s.project_id
    // binds 'Parser' → no symbol row has that project_id → [].
    const preFixParams = [params[1], params[0], ...params.slice(2)];
    const replayed = await adapter.allAsync(listCall!.sql, preFixParams);
    expect(replayed).toEqual([]);
  });
});
