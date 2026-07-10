/**
 * SA4E-27 — IsolationLayer Unit Tests
 * Tests the centralized scope enforcement module (pure functions, no DB needed for most).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  buildReadFilter,
  buildWriteDecorator,
  validateMutationOwnership,
  validateReadAccess,
  buildIngestFileDeleteClause,
} from '../IsolationLayer.js';
import { createProjectContext } from '../ProjectContext.js';
import type { ProjectContext } from '../ProjectContext.js';
import type { KnowledgeEntry } from '../models.js';
import { makeTempDb, type TempDb } from '../../../__tests__/sa4e-testkit.js';

// Helper to create a minimal KnowledgeEntry for testing
function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 1, content: 'test', summary: 'test', type: 'CONTEXT',
    tier: 'WORKING', scope: 'PROJECT', user_id: 'user-1',
    project_id: 'app-A', source: null, source_ref: null, tags: '',
    confidence: 1.0, access_count: 0, created_at: '', updated_at: '',
    last_accessed_at: null, expires_at: null, pinned: 0, pin_order: 0,
    structured_map: '{}', quality_score: null, archived: 0,
    agent_name: null, owner: null,
    ...overrides,
  };
}

// ─── PBT — Property-Based Tests ─────────────────────────────────────

describe('SA4E-27 PBT — IsolationLayer Properties', () => {
  it('PBT-01: buildReadFilter always includes SHARED in clause', () => {
    fc.assert(fc.property(
      fc.record({
        projectId: fc.string({ minLength: 1, maxLength: 50 }),
        userId: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      ({ projectId, userId }) => {
        const ctx = createProjectContext(projectId, userId);
        const { clause } = buildReadFilter(ctx);
        expect(clause).toContain('SHARED');
      },
    ), { numRuns: 100 });
  });

  it('PBT-02: buildReadFilter params count matches SQL placeholders', () => {
    fc.assert(fc.property(
      fc.record({
        projectId: fc.string({ minLength: 0, maxLength: 50 }),
        userId: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      ({ projectId, userId }) => {
        const ctx = createProjectContext(projectId, userId);
        const { clause, params } = buildReadFilter(ctx);
        const placeholders = (clause.match(/\?/g) || []).length;
        expect(params.length).toBe(placeholders);
      },
    ), { numRuns: 100 });
  });

  it('PBT-03: SHARED entries always pass validateReadAccess', () => {
    fc.assert(fc.property(
      fc.record({
        projectId: fc.string({ minLength: 1, maxLength: 50 }),
        userId: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      ({ projectId, userId }) => {
        const ctx = createProjectContext(projectId, userId);
        const entry = makeEntry({ scope: 'SHARED', project_id: 'other-project' });
        expect(validateReadAccess(ctx, entry)).toBe(entry);
      },
    ), { numRuns: 50 });
  });

  it('PBT-04: validateMutationOwnership always allows SHARED entries', () => {
    fc.assert(fc.property(
      fc.record({
        projectId: fc.string({ minLength: 1, maxLength: 50 }),
        userId: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      ({ projectId, userId }) => {
        const ctx = createProjectContext(projectId, userId);
        const entry = makeEntry({ scope: 'SHARED' });
        expect(validateMutationOwnership(ctx, entry).allowed).toBe(true);
      },
    ), { numRuns: 50 });
  });
});

// ─── UT — Unit Tests ─────────────────────────────────────────────────

describe('SA4E-27 UT — buildReadFilter', () => {
  it('UT-01: with projectId returns project_id filter in clause', () => {
    const ctx = createProjectContext('app-A', 'user-1');
    const { clause, params } = buildReadFilter(ctx);
    expect(clause).toContain("scope = 'SHARED'");
    expect(clause).toContain("scope = 'PROJECT'");
    expect(clause).toContain('project_id = ?');
    expect(clause).toContain('project_id IS NULL');
    expect(clause).toContain("scope = 'USER'");
    expect(clause).toContain('user_id = ?');
    expect(params).toEqual(['app-A', 'user-1']);
  });

  it('UT-02: without projectId (empty string) returns backward-compat clause', () => {
    const ctx = createProjectContext('', 'user-1');
    const { clause, params } = buildReadFilter(ctx);
    expect(clause).toContain("scope IN ('PROJECT', 'SHARED')");
    expect(clause).not.toContain('project_id = ?');
    expect(params).toEqual(['user-1']);
  });

  it('UT-03: with tableAlias prefixes all columns', () => {
    const ctx = createProjectContext('app-A', 'user-1');
    const { clause } = buildReadFilter(ctx, 'ke');
    expect(clause).toContain('ke.scope');
    expect(clause).toContain('ke.project_id');
    expect(clause).toContain('ke.user_id');
  });
});

describe('SA4E-27 UT — validateReadAccess', () => {
  const ctx = createProjectContext('app-A', 'user-1');

  it('UT-04: returns undefined for undefined entry', () => {
    expect(validateReadAccess(ctx, undefined)).toBeUndefined();
  });

  it('UT-05: SHARED entry always accessible', () => {
    const entry = makeEntry({ scope: 'SHARED', project_id: 'other' });
    expect(validateReadAccess(ctx, entry)).toBe(entry);
  });

  it('UT-06: USER entry accessible if same userId', () => {
    const entry = makeEntry({ scope: 'USER', user_id: 'user-1' });
    expect(validateReadAccess(ctx, entry)).toBe(entry);
  });

  it('UT-07: USER entry blocked if different userId', () => {
    const entry = makeEntry({ scope: 'USER', user_id: 'user-2' });
    expect(validateReadAccess(ctx, entry)).toBeUndefined();
  });

  it('UT-08: PROJECT entry accessible if same projectId', () => {
    const entry = makeEntry({ scope: 'PROJECT', project_id: 'app-A' });
    expect(validateReadAccess(ctx, entry)).toBe(entry);
  });

  it('UT-09: PROJECT entry accessible if NULL projectId (legacy)', () => {
    const entry = makeEntry({ scope: 'PROJECT', project_id: null });
    expect(validateReadAccess(ctx, entry)).toBe(entry);
  });

  it('UT-10: PROJECT entry blocked if different projectId', () => {
    const entry = makeEntry({ scope: 'PROJECT', project_id: 'app-B' });
    expect(validateReadAccess(ctx, entry)).toBeUndefined();
  });

  it('UT-11: PROJECT entry accessible in backward-compat mode (no projectId)', () => {
    const noProjectCtx = createProjectContext('', 'user-1');
    const entry = makeEntry({ scope: 'PROJECT', project_id: 'app-B' });
    expect(validateReadAccess(noProjectCtx, entry)).toBe(entry);
  });
});

describe('SA4E-27 UT — validateMutationOwnership', () => {
  const ctx = createProjectContext('app-A', 'user-1');

  it('UT-12: USER entry owned by same user — allowed', () => {
    const entry = makeEntry({ scope: 'USER', user_id: 'user-1' });
    expect(validateMutationOwnership(ctx, entry)).toEqual({ allowed: true });
  });

  it('UT-13: USER entry owned by different user — denied', () => {
    const entry = makeEntry({ scope: 'USER', user_id: 'user-2' });
    const result = validateMutationOwnership(ctx, entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('user-2');
  });

  it('UT-14: PROJECT entry same project — allowed', () => {
    const entry = makeEntry({ scope: 'PROJECT', project_id: 'app-A' });
    expect(validateMutationOwnership(ctx, entry)).toEqual({ allowed: true });
  });

  it('UT-15: PROJECT entry different project — denied', () => {
    const entry = makeEntry({ scope: 'PROJECT', project_id: 'app-B' });
    const result = validateMutationOwnership(ctx, entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('app-B');
  });

  it('UT-16: PROJECT entry NULL project_id (legacy) — allowed', () => {
    const entry = makeEntry({ scope: 'PROJECT', project_id: null });
    expect(validateMutationOwnership(ctx, entry)).toEqual({ allowed: true });
  });

  it('UT-17: SHARED entry — always allowed', () => {
    const entry = makeEntry({ scope: 'SHARED', project_id: 'other' });
    expect(validateMutationOwnership(ctx, entry)).toEqual({ allowed: true });
  });
});

describe('SA4E-27 UT — buildWriteDecorator', () => {
  it('UT-18: stamps project_id from context', () => {
    const ctx = createProjectContext('app-A', 'user-1');
    expect(buildWriteDecorator(ctx, 'PROJECT')).toEqual({ project_id: 'app-A' });
  });

  it('UT-19: empty projectId results in null', () => {
    const ctx = createProjectContext('', 'user-1');
    expect(buildWriteDecorator(ctx, 'PROJECT').project_id).toBeNull();
  });
});

describe('SA4E-27 UT — buildIngestFileDeleteClause', () => {
  it('UT-20: with projectId scopes delete to project', () => {
    const ctx = createProjectContext('app-A', 'user-1');
    const { clause, params } = buildIngestFileDeleteClause(ctx, '/path/file.md');
    expect(clause).toContain('source = ?');
    expect(clause).toContain('project_id = ?');
    expect(clause).toContain('project_id IS NULL');
    expect(params).toEqual(['/path/file.md', 'app-A']);
  });

  it('UT-21: without projectId deletes all matching source', () => {
    const ctx = createProjectContext('', 'user-1');
    const { clause, params } = buildIngestFileDeleteClause(ctx, '/path/file.md');
    expect(clause).toBe('DELETE FROM knowledge_entries WHERE source = ?');
    expect(params).toEqual(['/path/file.md']);
  });
});

describe('SA4E-27 UT — createProjectContext', () => {
  it('UT-22: creates immutable (frozen) context', () => {
    const ctx = createProjectContext('app-A', 'user-1', 'sess-123');
    expect(ctx.projectId).toBe('app-A');
    expect(ctx.userId).toBe('user-1');
    expect(ctx.sessionId).toBe('sess-123');
    expect(ctx.createdAt).toBeTruthy();
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  it('UT-23: frozen context cannot be mutated', () => {
    const ctx = createProjectContext('app-A', 'user-1');
    expect(() => { (ctx as any).projectId = 'hacked'; }).toThrow();
  });
});

// ─── IT — Integration Tests with Real SQLite ─────────────────────────

describe('SA4E-27 IT — IsolationLayer with Real SQLite', () => {
  let ctx: TempDb;

  beforeEach(() => {
    ctx = makeTempDb();
    // Seed data
    ctx.engine.insert({ content: 'A pattern', summary: 'proj-A', type: 'CONTEXT', scope: 'PROJECT', user_id: 'u1', project_id: 'app-A' });
    ctx.engine.insert({ content: 'B pattern', summary: 'proj-B', type: 'CONTEXT', scope: 'PROJECT', user_id: 'u1', project_id: 'app-B' });
    ctx.engine.insert({ content: 'Shared pattern', summary: 'shared', type: 'CONTEXT', scope: 'SHARED', user_id: 'u1', project_id: 'app-A' });
    ctx.engine.insert({ content: 'Legacy pattern', summary: 'legacy', type: 'CONTEXT', scope: 'PROJECT', user_id: 'u1', project_id: null });
    ctx.engine.insert({ content: 'User1 pattern', summary: 'user1-priv', type: 'CONTEXT', scope: 'USER', user_id: 'u1', project_id: null });
    ctx.engine.insert({ content: 'User2 pattern', summary: 'user2-priv', type: 'CONTEXT', scope: 'USER', user_id: 'u2', project_id: null });
  });
  afterEach(() => ctx.close());

  it('IT-01: buildReadFilter produces valid SQL executed against real DB', () => {
    const pCtx = createProjectContext('app-A', 'u1');
    const { clause, params } = buildReadFilter(pCtx);
    const sql = `SELECT * FROM knowledge_entries WHERE archived = 0 AND ${clause}`;
    const rows = ctx.engine.getDb().prepare(sql).all(...params) as any[];
    const summaries = rows.map((r: any) => r.summary);
    expect(summaries).toContain('proj-A');
    expect(summaries).toContain('shared');
    expect(summaries).toContain('legacy');
    expect(summaries).toContain('user1-priv');
    expect(summaries).not.toContain('proj-B');
    expect(summaries).not.toContain('user2-priv');
  });

  it('IT-02: buildIngestFileDeleteClause scoped delete works correctly', () => {
    // Insert two file-based entries in different projects
    ctx.engine.insert({ content: 'file content A', summary: 'file-A', type: 'CONTEXT', scope: 'PROJECT', user_id: 'u1', project_id: 'app-A', source: '/test/file.md' });
    ctx.engine.insert({ content: 'file content B', summary: 'file-B', type: 'CONTEXT', scope: 'PROJECT', user_id: 'u1', project_id: 'app-B', source: '/test/file.md' });

    const pCtx = createProjectContext('app-A', 'u1');
    const { clause, params } = buildIngestFileDeleteClause(pCtx, '/test/file.md');
    ctx.engine.getDb().prepare(clause).run(...params);

    // Only app-A entry should be deleted
    const remaining = ctx.engine.getDb().prepare(
      "SELECT * FROM knowledge_entries WHERE source = '/test/file.md'",
    ).all() as any[];
    expect(remaining.length).toBe(1);
    expect(remaining[0].project_id).toBe('app-B');
  });

  it('IT-03: promoteEntry stamps project_id when USER -> PROJECT', () => {
    const id = ctx.engine.insert({ content: 'user entry', summary: 'promote-test', type: 'CONTEXT', scope: 'USER', user_id: 'u1' });
    const result = ctx.engine.promoteEntry(id, 'PROJECT', 'app-A');
    expect(result).toBe(true);
    const entry = ctx.engine.findById(id);
    expect(entry?.scope).toBe('PROJECT');
    expect(entry?.project_id).toBe('app-A');
  });

  it('IT-04: promoteEntry without projectId does not stamp project_id', () => {
    const id = ctx.engine.insert({ content: 'user entry 2', summary: 'promote-no-pid', type: 'CONTEXT', scope: 'USER', user_id: 'u1' });
    const result = ctx.engine.promoteEntry(id, 'PROJECT');
    expect(result).toBe(true);
    const entry = ctx.engine.findById(id);
    expect(entry?.scope).toBe('PROJECT');
    expect(entry?.project_id).toBeNull();
  });
});
