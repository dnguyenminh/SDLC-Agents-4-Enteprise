/**
 * SA4E-31 — Cross-workspace KB isolation reproduction + regression tests.
 *
 * Proves KB entries do NOT leak across workspaces (projectId) for USER/PROJECT/SHARED
 * scopes, across BOTH the LLM path (MemoryEngine.search / findFiltered) and the
 * unified IsolationLayer.buildReadFilter.
 *
 * Target semantics (user-confirmed):
 *  - USER:    scope='USER'    AND user_id=? AND project_id=?
 *  - PROJECT: scope='PROJECT' AND project_id=?           (no project_id IS NULL escape)
 *  - SHARED:  scope='SHARED'  AND current project granted in kb_shared_grants
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MemoryEngine } from '../engine/core.js';
import { SqliteDbAdapter } from '../task-queue/SqliteDbAdapter.js';
import { TABLES } from '../schema/tables.js';
import { buildReadFilter } from '../IsolationLayer.js';
import { createProjectContext } from '../ProjectContext.js';

interface TempDb { db: Database.Database; engine: MemoryEngine; dir: string; close: () => void; }

function makeDb(): TempDb {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e31-'));
  const db = new Database(path.join(dir, 'index.db'));
  db.exec(TABLES);
  const engine = new MemoryEngine(new SqliteDbAdapter(db));
  return { db, engine, dir, close: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

const PA = 'proj-A';
const PB = 'proj-B';
const UA = 'user-A';
const UB = 'user-B';

describe('SA4E-31 — cross-workspace KB isolation', () => {
  let t: TempDb;
  beforeEach(() => {
    t = makeDb();
    t.engine.insert({ content: 'A user secret', summary: 'A-user', type: 'CONTEXT', scope: 'USER', user_id: UA, project_id: PA });
    t.engine.insert({ content: 'A project doc', summary: 'A-project', type: 'CONTEXT', scope: 'PROJECT', user_id: UA, project_id: PA });
    t.engine.insert({ content: 'legacy null', summary: 'legacy', type: 'CONTEXT', scope: 'PROJECT', user_id: UA, project_id: null });
    t.engine.insert({ content: 'shared company', summary: 'shared', type: 'CONTEXT', scope: 'SHARED', user_id: UA, project_id: PA });
  });
  afterEach(() => t.close());

  function readFor(projectId: string, userId: string) {
    const ctx = createProjectContext(projectId, userId);
    const { clause, params } = buildReadFilter(ctx);
    return t.db.prepare(`SELECT * FROM knowledge_entries WHERE archived = 0 AND ${clause}`).all(...params) as any[];
  }

  it('REPRO: workspace B does NOT see workspace A USER entry', () => {
    const rows = readFor(PB, UB);
    expect(rows.find(r => r.summary === 'A-user')).toBeUndefined();
  });

  it('REPRO: workspace B does NOT see workspace A PROJECT entry', () => {
    const rows = readFor(PB, UB);
    expect(rows.find(r => r.summary === 'A-project')).toBeUndefined();
  });

  it('REPRO: legacy NULL project_id entry does NOT leak to workspace B', () => {
    const rows = readFor(PB, UB);
    expect(rows.find(r => r.summary === 'legacy')).toBeUndefined();
  });

  it('REPRO: SHARED entry hidden from workspace B when B not granted', () => {
    const rows = readFor(PB, UB);
    expect(rows.find(r => r.summary === 'shared')).toBeUndefined();
  });

  it('SHARED entry visible to workspace B when B IS granted', () => {
    t.db.prepare('INSERT OR IGNORE INTO kb_shared_grants (project_id) VALUES (?)').run(PB);
    const rows = readFor(PB, UB);
    expect(rows.find(r => r.summary === 'shared')).toBeDefined();
  });

  it('workspace A sees its own USER + PROJECT + (granted) SHARED', () => {
    t.db.prepare('INSERT OR IGNORE INTO kb_shared_grants (project_id) VALUES (?)').run(PA);
    const rows = readFor(PA, UA);
    const summaries = rows.map(r => r.summary);
    expect(summaries).toContain('A-user');
    expect(summaries).toContain('A-project');
    expect(summaries).toContain('shared');
  });

  it('same project, different user does NOT see other user USER entry', () => {
    const rows = readFor(PA, UB);
    expect(rows.find(r => r.summary === 'A-user')).toBeUndefined();
    expect(rows.find(r => r.summary === 'A-project')).toBeDefined();
  });

  it('LLM path: MemoryEngine.search respects isolation (B sees nothing from A)', async () => {
    const results = await t.engine.search('secret doc shared', 20, undefined, undefined, { userId: UB, projectId: PB });
    expect(results.length).toBe(0);
  });

  it('LLM path: MemoryEngine.findFiltered respects isolation', async () => {
    const rows = await t.engine.findFiltered(undefined, undefined, 50, { userId: UB, projectId: PB });
    expect(rows.length).toBe(0);
  });
});
