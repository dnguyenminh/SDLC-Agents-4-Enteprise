/**
 * SA4E-41 Graph sync test — GraphSyncService projects only the target tenant's
 * code symbols into admin.db graph_nodes; other tenants and KB nodes untouched.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import pino from 'pino';
import { GraphSyncService } from '../graph-sync-service.js';

const PID_A = 'proj_aaaa';
const PID_B = 'proj_bbbb';
const log = pino({ level: 'silent' });

const INDEX_SCHEMA = `
CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  path TEXT, relative_path TEXT, language TEXT, module TEXT, content_hash TEXT, size_bytes INTEGER, line_count INTEGER);
CREATE TABLE symbols (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  file_id INTEGER, name TEXT, kind TEXT, signature TEXT, start_line INTEGER, end_line INTEGER,
  parent_symbol TEXT, visibility TEXT, doc_comment TEXT, complexity INTEGER, is_exported INTEGER DEFAULT 0);
`;

const ADMIN_SCHEMA = `
CREATE TABLE graph_nodes (entry_id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'DOCUMENT', tier TEXT NOT NULL DEFAULT 'SHARED', project_id TEXT NOT NULL DEFAULT '',
  x REAL DEFAULT 0, y REAL DEFAULT 0, z REAL DEFAULT 0, level INTEGER DEFAULT 2, cluster_id TEXT,
  created_at TEXT DEFAULT (datetime('now')));
`;

function seedSymbols(db: Database.Database, pid: string, names: string[]): void {
  const fInfo = db.prepare(`INSERT INTO files (project_id, path, relative_path, language) VALUES (?, ?, 'src/x.ts', 'typescript')`).run(pid, `/${pid}/x.ts`);
  const fileId = fInfo.lastInsertRowid as number;
  const ins = db.prepare(`INSERT INTO symbols (project_id, file_id, name, kind, start_line, end_line, is_exported, complexity) VALUES (?, ?, ?, 'function', 1, 5, 1, 2)`);
  for (const n of names) ins.run(pid, fileId, n);
}

describe('SA4E-41 GraphSyncService', () => {
  let indexDb: Database.Database;
  let adminDb: Database.Database;

  beforeEach(() => {
    indexDb = new Database(':memory:'); indexDb.exec(INDEX_SCHEMA);
    adminDb = new Database(':memory:'); adminDb.exec(ADMIN_SCHEMA);
    seedSymbols(indexDb, PID_A, ['alphaOne', 'alphaTwo']);
    seedSymbols(indexDb, PID_B, ['bravoOne']);
    // A pre-existing KB node for A must never be touched by code sync.
    adminDb.prepare(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id) VALUES ('doc-1', 'KB', 'CONTEXT', 'SEMANTIC', ?)`).run(PID_A);
  });

  afterEach(() => { indexDb.close(); adminDb.close(); });

  it('projects only the target tenant code nodes', () => {
    new GraphSyncService(indexDb, adminDb, log).syncProjectSymbols(PID_B);
    const codeNodes = adminDb.prepare("SELECT project_id FROM graph_nodes WHERE entry_id LIKE 'code:%'").all() as { project_id: string }[];
    expect(codeNodes.length).toBe(1);
    expect(codeNodes.every(n => n.project_id === PID_B)).toBe(true);
  });

  it('does not create code nodes for other tenants', () => {
    new GraphSyncService(indexDb, adminDb, log).syncProjectSymbols(PID_B);
    const aCode = adminDb.prepare("SELECT COUNT(*) c FROM graph_nodes WHERE entry_id LIKE 'code:%' AND project_id = ?").get(PID_A) as any;
    expect(aCode.c).toBe(0);
  });

  it('leaves KB (non-code) nodes untouched', () => {
    new GraphSyncService(indexDb, adminDb, log).syncProjectSymbols(PID_B);
    const kb = adminDb.prepare("SELECT COUNT(*) c FROM graph_nodes WHERE entry_id = 'doc-1'").get() as any;
    expect(kb.c).toBe(1);
  });

  it('is idempotent (re-sync replaces, does not duplicate)', () => {
    const svc = new GraphSyncService(indexDb, adminDb, log);
    svc.syncProjectSymbols(PID_B);
    svc.syncProjectSymbols(PID_B);
    const count = adminDb.prepare("SELECT COUNT(*) c FROM graph_nodes WHERE entry_id LIKE 'code:%' AND project_id = ?").get(PID_B) as any;
    expect(count.c).toBe(1);
  });

  it('fail-closed: empty projectId is a no-op', () => {
    new GraphSyncService(indexDb, adminDb, log).syncProjectSymbols('');
    const count = adminDb.prepare("SELECT COUNT(*) c FROM graph_nodes WHERE entry_id LIKE 'code:%'").get() as any;
    expect(count.c).toBe(0);
  });
});
