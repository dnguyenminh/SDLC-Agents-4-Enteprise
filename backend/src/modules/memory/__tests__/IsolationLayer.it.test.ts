/**
 * SA4E-27 — IsolationLayer integration tests with real SQLite.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildReadFilter,
  buildIngestFileDeleteClause,
} from '../IsolationLayer.js';
import { createProjectContext } from '../ProjectContext.js';
import { makeTempDb, type TempDb } from '../../../__tests__/sa4e-testkit.js';

// ─── IT — Integration Tests with Real SQLite ─────────────────────────

describe('SA4E-27 IT — IsolationLayer with Real SQLite', () => {
  let ctx: TempDb;

  beforeEach(async () => {
    ctx = await makeTempDb();
    // Seed data
    await ctx.engine.insert({ content: 'A pattern', summary: 'proj-A', type: 'CONTEXT', scope: 'WORKSPACE', user_id: 'u1', project_id: 'app-A' });
    await ctx.engine.insert({ content: 'B pattern', summary: 'proj-B', type: 'CONTEXT', scope: 'WORKSPACE', user_id: 'u1', project_id: 'app-B' });
    await ctx.engine.insert({ content: 'Shared pattern', summary: 'shared', type: 'CONTEXT', scope: 'SHARED', user_id: 'u1', project_id: 'app-A' });
    await ctx.engine.insert({ content: 'Legacy pattern', summary: 'legacy', type: 'CONTEXT', scope: 'PROJECT', user_id: 'u1', project_id: null });
    await ctx.engine.insert({ content: 'User1 pattern', summary: 'user1-priv', type: 'CONTEXT', scope: 'USER', user_id: 'u1', project_id: null });
    await ctx.engine.insert({ content: 'User2 pattern', summary: 'user2-priv', type: 'CONTEXT', scope: 'USER', user_id: 'u2', project_id: null });
  });
  afterEach(async () => { await ctx.close(); });

  it('IT-01: buildReadFilter enforces strict isolation against real DB (SA4E-31)', () => {
     ((ctx.dbManager.getDb() as any)).prepare('INSERT OR IGNORE INTO kb_shared_grants (project_id) VALUES (?)').run('app-A');
    const pCtx = createProjectContext('app-A', 'u1');
    const { clause, params } = buildReadFilter(pCtx);
    const sql = `SELECT * FROM knowledge_entries WHERE archived = 0 AND ${clause}`;
    const rows = (ctx.dbManager.getDb() as any).prepare(sql).all(...params) as any[];
    const summaries = rows.map((r: any) => r.summary);
    expect(summaries).toContain('proj-A');       // WORKSPACE app-A + user u1
    expect(summaries).toContain('shared');        // SHARED granted for app-A
    expect(summaries).not.toContain('legacy');    // PROJECT NULL — no longer leaks
    expect(summaries).not.toContain('user1-priv');// USER scope not included
    expect(summaries).not.toContain('proj-B');    // WORKSPACE app-B different project
    expect(summaries).not.toContain('user2-priv');// USER scope not included
  });

  it('IT-02: buildIngestFileDeleteClause scoped delete works correctly', async () => {
    // Insert two file-based entries in different projects
    await ctx.engine.insert({ content: 'file content A', summary: 'file-A', type: 'CONTEXT', scope: 'PROJECT', user_id: 'u1', project_id: 'app-A', source: '/test/file.md' });
    await ctx.engine.insert({ content: 'file content B', summary: 'file-B', type: 'CONTEXT', scope: 'PROJECT', user_id: 'u1', project_id: 'app-B', source: '/test/file.md' });

    const pCtx = createProjectContext('app-A', 'u1');
    const { clause, params } = buildIngestFileDeleteClause(pCtx, '/test/file.md');
    (ctx.engine.getDb() as any).prepare(clause).run(...params);

    // Only app-A entry should be deleted
    const remaining = (ctx.engine.getDb() as any).prepare(
      "SELECT * FROM knowledge_entries WHERE source = '/test/file.md'",
    ).all() as any[];
    expect(remaining.length).toBe(1);
    expect(remaining[0].project_id).toBe('app-B');
  });

  it('IT-03: promoteEntry stamps project_id when USER -> PROJECT', async () => {
    const id = await ctx.engine.insert({ content: 'user entry', summary: 'promote-test', type: 'CONTEXT', scope: 'USER', user_id: 'u1' });
    const result = await ctx.engine.promoteEntry(id, 'PROJECT', 'app-A');
    expect(result).toBe(true);
    const entry = await ctx.engine.findById(id);
    expect(entry?.scope).toBe('PROJECT');
    expect(entry?.project_id).toBe('app-A');
  });

  it('IT-04: promoteEntry without projectId does not stamp project_id', async () => {
    const id = await ctx.engine.insert({ content: 'user entry 2', summary: 'promote-no-pid', type: 'CONTEXT', scope: 'USER', user_id: 'u1' });
    const result = await ctx.engine.promoteEntry(id, 'PROJECT');
    expect(result).toBe(true);
    const entry = await ctx.engine.findById(id);
    expect(entry?.scope).toBe('PROJECT');
    expect(entry?.project_id).toBeNull();
  });
});
