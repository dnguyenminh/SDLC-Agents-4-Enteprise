/**
 * SA4E-26 - Project Isolation Tests.
 * This file: UT — buildScopeClause & buildScopeParams (real SQLite via testkit).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTempDb, type TempDb } from '../../../__tests__/sa4e-testkit.js';
import { MemoryEngine } from '../engine/index.js';

describe('SA4E-26 UT — buildScopeClause & buildScopeParams', () => {
  let ctx: TempDb;
  let engine: MemoryEngine;

  beforeEach(async () => { ctx = await makeTempDb(); engine = ctx.engine; });
  afterEach(async () => { await ctx.close(); });

  it('UT-01: buildScopeClause with projectId returns strict per-workspace clause (SA4E-31)', () => {
    const clause = engine.buildScopeClause({ userId: 'user-1', projectId: 'app-A' });
    expect(clause).toMatch(/SHARED/);
    expect(clause).toContain("scope = 'WORKSPACE'");
    expect(clause).toContain('project_id = ?');
    // SA4E-31: no NULL escape; WORKSPACE scoped to user_id + project_id
    expect(clause).not.toContain('project_id IS NULL');
    expect(clause).toContain("scope = 'WORKSPACE'");
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

  it('UT-07: insert with project_id stores value in DB', async () => {
    const id = await engine.insert({
      content: 'test content', summary: 'test', type: 'CONTEXT',
      project_id: 'app-A',
    });
    const row = await engine.findById(id);
    expect(row?.project_id).toBe('app-A');
  });

  it('UT-08: insert without project_id stores NULL', async () => {
    const id = await engine.insert({
      content: 'test content', summary: 'test', type: 'CONTEXT',
    });
    const row = await engine.findById(id);
    expect(row?.project_id ?? null).toBeNull();
  });
});
