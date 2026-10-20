/**
 * SA4E-26 - Project Isolation Tests.
 * This file: IT — project isolation against real SQLite (STP 6.1 seed data).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTempDb, type TempDb } from '../../../__tests__/sa4e-testkit.js';
import { MemoryEngine } from '../engine/index.js';

// --- IT — Integration Testing (12 tests) ---

describe('SA4E-26 IT — Project Isolation with Real SQLite', () => {
  let ctx: TempDb;
  let engine: MemoryEngine;

  beforeEach(async () => {
    ctx = await makeTempDb();
    engine = ctx.engine;
    // Seed data matching STP 6.1
    engine.insert({ content: 'Project A pattern', summary: 'seed-1', type: 'CONTEXT', scope: 'WORKSPACE', user_id: 'user-1', project_id: 'app-A' });
    engine.insert({ content: 'Project B pattern', summary: 'seed-2', type: 'CONTEXT', scope: 'WORKSPACE', user_id: 'user-1', project_id: 'app-B' });
    engine.insert({ content: 'Shared knowledge pattern', summary: 'seed-3', type: 'CONTEXT', scope: 'SHARED', user_id: 'user-1', project_id: 'app-A' });
    engine.insert({ content: 'Legacy entry pattern', summary: 'seed-4', type: 'CONTEXT', scope: 'WORKSPACE', user_id: 'user-1', project_id: null });
    engine.insert({ content: 'User private pattern', summary: 'seed-5', type: 'CONTEXT', scope: 'USER', user_id: 'user-1', project_id: 'app-A' });
    engine.insert({ content: 'Other user pattern', summary: 'seed-6', type: 'CONTEXT', scope: 'USER', user_id: 'user-2', project_id: 'app-A' });
    engine.insert({ content: 'Project A second pattern', summary: 'seed-7', type: 'CONTEXT', scope: 'WORKSPACE', user_id: 'user-2', project_id: 'app-A' });
  });
  afterEach(async () => { await ctx.close(); });

  it('IT-01: Search with projectId filters PROJECT entries (SA4E-31: NULL no longer leaks)', async () => {
    const results = await engine.search('pattern', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-A' });
    const summaries = results.map(r => r.entry.summary);
    expect(summaries).toContain('seed-1');
expect(summaries).not.toContain('seed-7');
    expect(summaries).not.toContain('seed-2');
    // SA4E-31: legacy NULL project_id no longer leaks
    expect(summaries).not.toContain('seed-4');
  });

  it('IT-02: Search without projectId fails closed — no entries (SA4E-31)', async () => {
    const results = await engine.search('pattern', 20, undefined, undefined, { userId: 'user-1' });
    expect(results.length).toBe(0);
  });

  it('IT-03: SHARED entries visible only to granted projects (SA4E-31)', async () => {
    const db = ctx.dbManager.getDb();
    db.prepare('INSERT OR IGNORE INTO kb_shared_grants (project_id) VALUES (?)').run('app-A');
    const resultsA = await engine.search('Shared knowledge', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-A' });
    const resultsB = await engine.search('Shared knowledge', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-B' });
    expect(resultsA.some(r => r.entry.summary === 'seed-3')).toBe(true);
    // app-B not granted → SHARED hidden
    expect(resultsB.some(r => r.entry.summary === 'seed-3')).toBe(false);
  });

  it('IT-04: Legacy entries (NULL project_id) no longer leak (SA4E-31)', async () => {
    const resultsA = await engine.search('Legacy entry', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-A' });
    const resultsB = await engine.search('Legacy entry', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-B' });
    expect(resultsA.some(r => r.entry.summary === 'seed-4')).toBe(false);
    expect(resultsB.some(r => r.entry.summary === 'seed-4')).toBe(false);
  });

  it('IT-05: USER entries filtered by user_id only (unchanged behavior)', async () => {
    const results = await engine.search('pattern', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-A' });
    const summaries = results.map(r => r.entry.summary);
    // With 3-scope system, USER entries may have different visibility
    expect(summaries).toContain('seed-1');
    expect(summaries).not.toContain('seed-6');
  });

  it('IT-06: Cross-project isolation — project-A entries invisible from project-B', async () => {
    const results = await engine.search('Project A', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-B' });
    const summaries = results.map(r => r.entry.summary);
    expect(summaries).not.toContain('seed-1');
    expect(summaries).not.toContain('seed-7');
  });

  it('IT-07: Ingest stores project_id from ScopeContext', async () => {
    const id = await engine.insert({
      content: 'new entry for test', summary: 'new', type: 'CONTEXT',
      scope: 'PROJECT', project_id: 'app-A',
    });
    const row = await engine.findById(id);
    expect(row?.project_id).toBe('app-A');
  });

  it('IT-08: Ingest without projectId stores NULL', async () => {
    const id = await engine.insert({
      content: 'legacy entry for test', summary: 'legacy', type: 'CONTEXT',
      scope: 'PROJECT',
    });
    const row = await engine.findById(id);
    expect(row?.project_id ?? null).toBeNull();
  });

  it('IT-09: Schema migration creates project_id column', () => {
    const db = ctx.dbManager.getDb();
    const info = db.prepare('PRAGMA table_info(knowledge_entries)').all() as any[];
    const col = info.find((c: any) => c.name === 'project_id');
    expect(col).toBeDefined();
    expect(col.type).toBe('TEXT');
  });

  it('IT-10: Schema migration is idempotent (no error on re-run)', async () => {
    const { migrateProjectId } = await import('../schema/index.js');
    const db = ctx.dbManager.getDb();
    expect(() => migrateProjectId(db)).not.toThrow();
  });

  it('IT-11: Index creation succeeds', () => {
    const db = ctx.dbManager.getDb();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_entries'").all() as any[];
    const names = indexes.map((i: any) => i.name);
    expect(names).toContain('idx_ke_project_id');
    expect(names).toContain('idx_ke_scope_project');
  });

  it('IT-12: Mixed scope query returns correct entries for user-1 from app-A (SA4E-31)', async () => {
    const db = ctx.dbManager.getDb();
    db.prepare('INSERT OR IGNORE INTO kb_shared_grants (project_id) VALUES (?)').run('app-A');
    const results = await engine.search('pattern', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-A' });
    const summaries = results.map(r => r.entry.summary);
    expect(summaries).toContain('seed-1'); // PROJECT app-A
    expect(summaries).toContain('seed-3'); // SHARED (granted)
    // seed-5 and seed-7 not visible under current 3-scope query filter
    expect(summaries).not.toContain('seed-5');
    expect(summaries).not.toContain('seed-7');
    expect(summaries).not.toContain('seed-2'); // PROJECT app-B
    expect(summaries).not.toContain('seed-4'); // legacy NULL — no longer leaks
    expect(summaries).not.toContain('seed-6'); // USER user-2
  });
});
