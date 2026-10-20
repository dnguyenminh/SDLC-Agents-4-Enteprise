/**
 * SA4E-27 — IsolationLayer Unit Tests.
 * This file: ingest-file delete clauses + createProjectContext (pure functions).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildIngestFileDeleteClause,
  buildIngestFileStaleTaskDeleteClause,
} from '../IsolationLayer.js';
import { createProjectContext } from '../ProjectContext.js';

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

describe('D3 UT — buildIngestFileStaleTaskDeleteClause (child-first cleanup)', () => {
  it('UT-24: with projectId scopes the stale-task delete to project (mirrors UT-20 predicate)', () => {
    const ctx = createProjectContext('app-A', 'user-1');
    const { clause, params } = buildIngestFileStaleTaskDeleteClause(ctx, '/path/file.md');
    expect(clause).toContain('DELETE FROM pending_tasks');
    expect(clause).toContain('SELECT id FROM knowledge_entries');
    expect(clause).toContain('source = ?');
    expect(clause).toContain('project_id = ?');
    expect(clause).toContain('project_id IS NULL');
    expect(params).toEqual(['/path/file.md', 'app-A']);
  });

  it('UT-25: without projectId (or undefined ctx) deletes by source only (mirrors UT-21 predicate)', () => {
    const noProject = createProjectContext('', 'user-1');
    const scoped = buildIngestFileStaleTaskDeleteClause(noProject, '/path/file.md');
    expect(scoped.clause).toBe('DELETE FROM pending_tasks WHERE entry_id IN (SELECT id FROM knowledge_entries WHERE source = ?)');
    expect(scoped.params).toEqual(['/path/file.md']);

    const noCtx = buildIngestFileStaleTaskDeleteClause(undefined, '/path/file.md');
    expect(noCtx.clause).toBe(scoped.clause);
    expect(noCtx.params).toEqual(['/path/file.md']);
  });

  it('PBT-06: WHERE predicate always mirrors buildIngestFileDeleteClause', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.boolean(),
      (projectId, userId, withProject) => {
        const ctx = createProjectContext(withProject ? projectId : '', userId);
        const del = buildIngestFileDeleteClause(ctx, '/p/f.md');
        const taskDel = buildIngestFileStaleTaskDeleteClause(ctx, '/p/f.md');
        // Same predicate, same params — only the target table differs.
        const delWhere = del.clause.slice(del.clause.indexOf('WHERE'));
        const taskWhere = taskDel.clause.slice(taskDel.clause.indexOf('WHERE'));
        const nested = taskWhere.match(/\(SELECT id FROM knowledge_entries(.*)\)$/);
        expect(nested).not.toBeNull();
        expect(nested![1].trim()).toBe(delWhere);
        expect(taskDel.params).toEqual(del.params);
      },
    ));
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
