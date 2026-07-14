/**
 * SA4E-26 — Project Isolation Tests
 * PBT (4) + UT (14) + IT (12) = 30 test cases
 * Uses real SQLite via sa4e-testkit (no mocks).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { makeTempDb, type TempDb } from '../../../__tests__/sa4e-testkit.js';
import { MemoryEngine } from '../engine/index.js';
import { MemoryToolDispatcher } from '../dispatchers/index.js';
import type { ScopeContext } from '../models.js';

// --- PBT — Property-Based Testing (4 tests) ---

describe('SA4E-26 PBT — Scope Clause Properties', () => {
  let ctx: TempDb;
  let engine: MemoryEngine;

  beforeEach(() => { ctx = makeTempDb(); engine = ctx.engine; });
  afterEach(() => ctx.close());

  it('PBT-01: Scope clause with projectId includes SHARED visibility (SA4E-31)', () => {
    fc.assert(fc.property(
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }),
        projectId: fc.string({ minLength: 1, maxLength: 100 }),
      }),
      (scopeCtx) => {
        const clause = engine.buildScopeClause(scopeCtx as ScopeContext);
        expect(clause).toMatch(/SHARED/);
      },
    ), { numRuns: 100 });
  });

  it('PBT-02: Scope clause with projectId always filters PROJECT by project_id', () => {
    fc.assert(fc.property(
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }),
        projectId: fc.string({ minLength: 1, maxLength: 100 }),
      }),
      (scopeCtx) => {
        const clause = engine.buildScopeClause(scopeCtx as ScopeContext);
        expect(clause).toContain('project_id = ?');
      },
    ), { numRuns: 100 });
  });

  it('PBT-03: Scope params count matches SQL placeholders', () => {
    fc.assert(fc.property(
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }),
        projectId: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
      }),
      (scopeCtx) => {
        const clause = engine.buildScopeClause(scopeCtx as ScopeContext);
        const params = engine.buildScopeParams(scopeCtx as ScopeContext);
        const placeholders = (clause.match(/\?/g) || []).length;
        expect(params.length).toBe(placeholders);
      },
    ), { numRuns: 100 });
  });

  it('PBT-04: Insert always stores project_id from context', () => {
    fc.assert(fc.property(
      fc.record({
        content: fc.string({ minLength: 1, maxLength: 200 }),
        project_id: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
      }),
      (entry) => {
        const id = engine.insert({
          content: entry.content,
          summary: entry.content.slice(0, 50),
          type: 'CONTEXT',
          project_id: entry.project_id,
        });
        const row = engine.findById(id);
        expect(row?.project_id).toBe(entry.project_id);
      },
    ), { numRuns: 100 });
  });
});

// --- UT — Unit Testing (14 tests) ---

describe('SA4E-26 UT — buildScopeClause & buildScopeParams', () => {
  let ctx: TempDb;
  let engine: MemoryEngine;

  beforeEach(() => { ctx = makeTempDb(); engine = ctx.engine; });
  afterEach(() => ctx.close());

  it('UT-01: buildScopeClause with projectId returns strict per-workspace clause (SA4E-31)', () => {
    const clause = engine.buildScopeClause({ userId: 'user-1', projectId: 'app-A' });
    expect(clause).toMatch(/SHARED/);
    expect(clause).toContain("scope = 'PROJECT'");
    expect(clause).toContain('project_id = ?');
    // SA4E-31: no NULL escape; USER scoped to user_id + project_id
    expect(clause).not.toContain('project_id IS NULL');
    expect(clause).toContain("scope = 'USER'");
    expect(clause).toContain('user_id = ?');
    expect(clause).toContain('kb_shared_grants');
  });

  it('UT-02: buildScopeClause without projectId fails closed (SA4E-31)', () => {
    const clause = engine.buildScopeClause({ userId: 'user-1' });
    expect(clause).toBe('1=0');
  });

  it('UT-03: buildScopeClause with tableAlias prefixes columns', () => {
    const clause = engine.buildScopeClause({ userId: 'u1', projectId: 'p1' }, 'ke');
    expect(clause).toContain('ke.scope');
    expect(clause).toContain('ke.project_id');
    expect(clause).toContain('ke.user_id');
  });

  it('UT-04: buildScopeClause with empty string projectId fails closed (SA4E-31)', () => {
    const clause = engine.buildScopeClause({ userId: 'user-1', projectId: '' });
    expect(clause).toBe('1=0');
  });

  it('UT-05: buildScopeParams with projectId returns [userId, projectId, projectId, projectId] (SA4E-31)', () => {
    const params = engine.buildScopeParams({ userId: 'user-1', projectId: 'app-A' });
    expect(params).toEqual(['user-1', 'app-A', 'app-A', 'app-A']);
  });

  it('UT-06: buildScopeParams without projectId returns [] (fail closed, SA4E-31)', () => {
    const params = engine.buildScopeParams({ userId: 'user-1' });
    expect(params).toEqual([]);
  });

  it('UT-07: insert with project_id stores value in DB', () => {
    const id = engine.insert({
      content: 'test content', summary: 'test', type: 'CONTEXT',
      project_id: 'app-A',
    });
    const row = engine.findById(id);
    expect(row?.project_id).toBe('app-A');
  });

  it('UT-08: insert without project_id stores NULL', () => {
    const id = engine.insert({
      content: 'test content', summary: 'test', type: 'CONTEXT',
    });
    const row = engine.findById(id);
    expect(row?.project_id).toBeNull();
  });
});

describe('SA4E-26 UT — deriveProjectId', () => {
  const originalEnv = process.env.CODE_INTEL_PROJECT_ID;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CODE_INTEL_PROJECT_ID;
    } else {
      process.env.CODE_INTEL_PROJECT_ID = originalEnv;
    }
  });

  it('UT-09: deriveProjectId from Unix path (hash of user+folder)', async () => {
    delete process.env.CODE_INTEL_PROJECT_ID;
    const { loadConfig } = await import('../../../config/BackendConfig.js');
    const config = loadConfig({ workspace: '/projects/my-app' } as any);
    // No git remote in test → falls to sha256(user:folder).slice(0,12)
    expect(config.projectId).toHaveLength(12);
    expect(config.projectId).toMatch(/^[a-f0-9]{12}$/);
  });

  it('UT-10: deriveProjectId from Windows path (hash of user+folder)', async () => {
    delete process.env.CODE_INTEL_PROJECT_ID;
    const { loadConfig } = await import('../../../config/BackendConfig.js');
    const config = loadConfig({ workspace: 'C:\\projects\\my-app' } as any);
    expect(config.projectId).toHaveLength(12);
    expect(config.projectId).toMatch(/^[a-f0-9]{12}$/);
  });

  it('UT-11: deriveProjectId from root path returns 12-char hash', async () => {
    delete process.env.CODE_INTEL_PROJECT_ID;
    const { loadConfig } = await import('../../../config/BackendConfig.js');
    const config = loadConfig({ workspace: '/' } as any);
    // sha256(user:/) or sha256(user:default) → 12 hex chars
    expect(config.projectId).toMatch(/^[a-f0-9]{12}$/);
  });

  it('UT-12: deriveProjectId from empty string returns hash', async () => {
    delete process.env.CODE_INTEL_PROJECT_ID;
    const { loadConfig } = await import('../../../config/BackendConfig.js');
    const config = loadConfig({ workspace: '' } as any);
    // sha256(user:default) → 12 hex chars
    expect(config.projectId).toMatch(/^[a-f0-9]{12}$/);
  });

  it('UT-13: deriveProjectId with config override', async () => {
    delete process.env.CODE_INTEL_PROJECT_ID;
    const { loadConfig } = await import('../../../config/BackendConfig.js');
    const config = loadConfig({ workspace: '/projects/my-app', projectId: 'custom-name' } as any);
    expect(config.projectId).toBe('custom-name');
  });

  it('UT-14: deriveProjectId with environment variable', async () => {
    process.env.CODE_INTEL_PROJECT_ID = 'env-project';
    const { loadConfig } = await import('../../../config/BackendConfig.js');
    const config = loadConfig({ workspace: '/projects/my-app' } as any);
    expect(config.projectId).toBe('env-project');
  });
});

// --- IT — Integration Testing (12 tests) ---

describe('SA4E-26 IT — Project Isolation with Real SQLite', () => {
  let ctx: TempDb;
  let engine: MemoryEngine;

  beforeEach(() => {
    ctx = makeTempDb();
    engine = ctx.engine;
    // Seed data matching STP 6.1
    engine.insert({ content: 'Project A pattern', summary: 'seed-1', type: 'CONTEXT', scope: 'PROJECT', user_id: 'user-1', project_id: 'app-A' });
    engine.insert({ content: 'Project B pattern', summary: 'seed-2', type: 'CONTEXT', scope: 'PROJECT', user_id: 'user-1', project_id: 'app-B' });
    engine.insert({ content: 'Shared knowledge pattern', summary: 'seed-3', type: 'CONTEXT', scope: 'SHARED', user_id: 'user-1', project_id: 'app-A' });
    engine.insert({ content: 'Legacy entry pattern', summary: 'seed-4', type: 'CONTEXT', scope: 'PROJECT', user_id: 'user-1', project_id: null });
    engine.insert({ content: 'User private pattern', summary: 'seed-5', type: 'CONTEXT', scope: 'USER', user_id: 'user-1', project_id: 'app-A' });
    engine.insert({ content: 'Other user pattern', summary: 'seed-6', type: 'CONTEXT', scope: 'USER', user_id: 'user-2', project_id: 'app-A' });
    engine.insert({ content: 'Project A second pattern', summary: 'seed-7', type: 'CONTEXT', scope: 'PROJECT', user_id: 'user-2', project_id: 'app-A' });
  });
  afterEach(() => ctx.close());

  it('IT-01: Search with projectId filters PROJECT entries (SA4E-31: NULL no longer leaks)', () => {
    const results = engine.search('pattern', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-A' });
    const summaries = results.map(r => r.entry.summary);
    expect(summaries).toContain('seed-1');
    expect(summaries).toContain('seed-7');
    expect(summaries).not.toContain('seed-2');
    // SA4E-31: legacy NULL project_id no longer leaks
    expect(summaries).not.toContain('seed-4');
  });

  it('IT-02: Search without projectId fails closed — no entries (SA4E-31)', () => {
    const results = engine.search('pattern', 20, undefined, undefined, { userId: 'user-1' });
    expect(results.length).toBe(0);
  });

  it('IT-03: SHARED entries visible only to granted projects (SA4E-31)', () => {
    const db = ctx.dbManager.getDb();
    db.prepare('INSERT OR IGNORE INTO kb_shared_grants (project_id) VALUES (?)').run('app-A');
    const resultsA = engine.search('Shared knowledge', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-A' });
    const resultsB = engine.search('Shared knowledge', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-B' });
    expect(resultsA.some(r => r.entry.summary === 'seed-3')).toBe(true);
    // app-B not granted → SHARED hidden
    expect(resultsB.some(r => r.entry.summary === 'seed-3')).toBe(false);
  });

  it('IT-04: Legacy entries (NULL project_id) no longer leak (SA4E-31)', () => {
    const resultsA = engine.search('Legacy entry', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-A' });
    const resultsB = engine.search('Legacy entry', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-B' });
    expect(resultsA.some(r => r.entry.summary === 'seed-4')).toBe(false);
    expect(resultsB.some(r => r.entry.summary === 'seed-4')).toBe(false);
  });

  it('IT-05: USER entries filtered by user_id only (unchanged behavior)', () => {
    const results = engine.search('pattern', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-A' });
    const summaries = results.map(r => r.entry.summary);
    expect(summaries).toContain('seed-5');
    expect(summaries).not.toContain('seed-6');
  });

  it('IT-06: Cross-project isolation — project-A entries invisible from project-B', () => {
    const results = engine.search('Project A', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-B' });
    const summaries = results.map(r => r.entry.summary);
    expect(summaries).not.toContain('seed-1');
    expect(summaries).not.toContain('seed-7');
  });

  it('IT-07: Ingest stores project_id from ScopeContext', () => {
    const id = engine.insert({
      content: 'new entry for test', summary: 'new', type: 'CONTEXT',
      scope: 'PROJECT', project_id: 'app-A',
    });
    const row = engine.findById(id);
    expect(row?.project_id).toBe('app-A');
  });

  it('IT-08: Ingest without projectId stores NULL', () => {
    const id = engine.insert({
      content: 'legacy entry for test', summary: 'legacy', type: 'CONTEXT',
      scope: 'PROJECT',
    });
    const row = engine.findById(id);
    expect(row?.project_id).toBeNull();
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

  it('IT-12: Mixed scope query returns correct entries for user-1 from app-A (SA4E-31)', () => {
    const db = ctx.dbManager.getDb();
    db.prepare('INSERT OR IGNORE INTO kb_shared_grants (project_id) VALUES (?)').run('app-A');
    const results = engine.search('pattern', 20, undefined, undefined, { userId: 'user-1', projectId: 'app-A' });
    const summaries = results.map(r => r.entry.summary);
    expect(summaries).toContain('seed-1'); // PROJECT app-A
    expect(summaries).toContain('seed-3'); // SHARED (granted)
    expect(summaries).toContain('seed-5'); // USER user-1 app-A
    expect(summaries).toContain('seed-7'); // PROJECT app-A
    expect(summaries).not.toContain('seed-2'); // PROJECT app-B
    expect(summaries).not.toContain('seed-4'); // legacy NULL — no longer leaks
    expect(summaries).not.toContain('seed-6'); // USER user-2
  });
});
