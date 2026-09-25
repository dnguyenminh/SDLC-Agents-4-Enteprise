/**
 * SA4E-41 Graph sync test — GraphSyncService projects only the target tenant's
 * code symbols into admin.db graph_nodes; other tenants and KB nodes untouched.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import pino from 'pino';
import { SqliteDbAdapter } from '../../../modules/memory/task-queue/SqliteDbAdapter.js';
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

async function seedSymbols(db: SqliteAdapter, pid: string, names: string[]): Promise<void> {
  const fInfo = await db.run(`INSERT INTO files (project_id, path, relative_path, language) VALUES (?, ?, 'src/x.ts', 'typescript')`, [pid, `/${pid}/x.ts`]);
  const fileId = fInfo.lastInsertRowid as number;
  for (const n of names) {
    await db.run(`INSERT INTO symbols (project_id, file_id, name, kind, start_line, end_line, is_exported, complexity) VALUES (?, ?, ?, 'function', 1, 5, 1, 2)`, [pid, fileId, n]);
  }
}

describe('SA4E-41 GraphSyncService', () => {
  let indexDb: SqliteAdapter;
  let adminDb: SqliteAdapter;

  beforeEach(async () => {
    indexDb = new SqliteAdapter(':memory:'); await indexDb.connect(); await indexDb.exec(INDEX_SCHEMA);
    adminDb = new SqliteAdapter(':memory:'); await adminDb.connect(); await adminDb.exec(ADMIN_SCHEMA);
    await seedSymbols(indexDb, PID_A, ['alphaOne', 'alphaTwo']);
    await seedSymbols(indexDb, PID_B, ['bravoOne']);
    // A pre-existing KB node for A must never be touched by code sync.
    await adminDb.run(`INSERT INTO graph_nodes (entry_id, label, type, tier, project_id) VALUES ('doc-1', 'KB', 'CONTEXT', 'SEMANTIC', ?)`, [PID_A]);
  });

  afterEach(async () => { await indexDb.disconnect(); await adminDb.disconnect(); });

  it('projects only the target tenant code nodes', async () => {
    await new GraphSyncService(new SqliteDbAdapter(indexDb), new SqliteDbAdapter(adminDb), log).syncProjectSymbols(PID_B);
    const codeNodes = await adminDb.all("SELECT project_id FROM graph_nodes WHERE entry_id LIKE 'code:%'") as { project_id: string }[];
    expect(codeNodes.length).toBe(1);
    expect(codeNodes.every(n => n.project_id === PID_B)).toBe(true);
  });

  it('does not create code nodes for other tenants', async () => {
    await new GraphSyncService(new SqliteDbAdapter(indexDb), new SqliteDbAdapter(adminDb), log).syncProjectSymbols(PID_B);
    const aCode = await adminDb.get("SELECT COUNT(*) c FROM graph_nodes WHERE entry_id LIKE 'code:%' AND project_id = ?", [PID_A]) as any;
    expect(aCode.c).toBe(0);
  });

  it('leaves KB (non-code) nodes untouched', async () => {
    await new GraphSyncService(new SqliteDbAdapter(indexDb), new SqliteDbAdapter(adminDb), log).syncProjectSymbols(PID_B);
    const kb = await adminDb.get("SELECT COUNT(*) c FROM graph_nodes WHERE entry_id = 'doc-1'") as any;
    expect(kb.c).toBe(1);
  });

  it('is idempotent (re-sync replaces, does not duplicate)', async () => {
    const svc = new GraphSyncService(new SqliteDbAdapter(indexDb), new SqliteDbAdapter(adminDb), log);
    await svc.syncProjectSymbols(PID_B);
    await svc.syncProjectSymbols(PID_B);
    const count = await adminDb.get("SELECT COUNT(*) c FROM graph_nodes WHERE entry_id LIKE 'code:%' AND project_id = ?", [PID_B]) as any;
    expect(count.c).toBe(1);
  });

  it('fail-closed: empty projectId is a no-op', async () => {
    await new GraphSyncService(new SqliteDbAdapter(indexDb), new SqliteDbAdapter(adminDb), log).syncProjectSymbols('');
    const count = await adminDb.get("SELECT COUNT(*) c FROM graph_nodes WHERE entry_id LIKE 'code:%'") as any;
    expect(count.c).toBe(0);
  });

  it('projects pega_* symbols alongside standard code kinds', async () => {
    // Seed Pega symbols into PID_B
    const fInfo = await indexDb.run(`INSERT INTO files (project_id, path, relative_path, language) VALUES (?, ?, 'rules/MyFlow.xml', 'pega')`, [PID_B, `/${PID_B}/rules/MyFlow.xml`]);
    const fileId = fInfo.lastInsertRowid as number;
    await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind, start_line, end_line, is_exported, complexity) VALUES (?, ?, 'ProcessClaim', 'pega_rule_obj_flow', 1, 10, 0, 5)`, [PID_B, fileId]);
    await indexDb.run(`INSERT INTO symbols (project_id, file_id, name, kind, start_line, end_line, is_exported, complexity) VALUES (?, ?, 'ValidateInput', 'pega_rule_obj_activity', 1, 8, 0, 3)`, [PID_B, fileId]);

    await new GraphSyncService(new SqliteDbAdapter(indexDb), new SqliteDbAdapter(adminDb), log).syncProjectSymbols(PID_B);

    // Should include bravoOne (function) + 2 pega symbols = 3
    const count = await adminDb.get("SELECT COUNT(*) c FROM graph_nodes WHERE entry_id LIKE 'code:%' AND project_id = ?", [PID_B]) as any;
    expect(count.c).toBe(3);

    // Verify pega symbols get distinct 1:1 graph types (derived from kind, not collapsed)
    const pegaNodes = await adminDb.all("SELECT label, type FROM graph_nodes WHERE entry_id LIKE 'code:%' AND type IN ('RULE_OBJ_FLOW', 'RULE_OBJ_ACTIVITY')") as any[];
    expect(pegaNodes.length).toBe(2);
    expect(pegaNodes.some(n => n.type === 'RULE_OBJ_FLOW')).toBe(true);
    expect(pegaNodes.some(n => n.type === 'RULE_OBJ_ACTIVITY')).toBe(true);
  });
});
