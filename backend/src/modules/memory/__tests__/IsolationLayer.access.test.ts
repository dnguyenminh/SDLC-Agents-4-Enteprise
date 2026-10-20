/**
 * SA4E-27 — IsolationLayer Unit Tests.
 * This file: buildReadFilter, validateReadAccess, validateMutationOwnership,
 * buildWriteDecorator (pure functions).
 */

import { describe, it, expect } from 'vitest';
import {
  buildReadFilter,
  buildWriteDecorator,
  validateMutationOwnership,
  validateReadAccess,
} from '../IsolationLayer.js';
import { createProjectContext } from '../ProjectContext.js';
import { makeEntry } from './helpers.js';

describe('SA4E-27 UT — buildReadFilter', () => {
  it('UT-01: with projectId returns strict per-workspace clause (SA4E-31)', () => {
    const ctx = createProjectContext('app-A', 'user-1');
    const { clause, params } = buildReadFilter(ctx);
    expect(clause).toContain("scope = 'SHARED'");
    expect(clause).not.toContain("scope = 'USER'");
    expect(clause).toContain("scope = 'WORKSPACE'");
    expect(clause).toContain("scope = 'PROJECT'");
    expect(clause).toContain('project_id = ?');
    expect(clause).not.toContain('project_id IS NULL');
    expect(clause).toContain("scope = 'WORKSPACE'");
    expect(clause).toContain('user_id = ?');
    expect(clause).toContain('kb_shared_grants');
    // SA4E-31 + SA4E-331: params include userId + projectId for WORKSPACE, projectId for PROJECT, + projectId for SHARED
    expect(params).toEqual(['user-1', 'app-A', 'app-A', 'app-A']);
  });

  it('UT-02: without projectId (empty string) fails closed (SA4E-31)', () => {
    const ctx = createProjectContext('', 'user-1');
    const { clause, params } = buildReadFilter(ctx);
    expect(clause).toBe('1=0');
    expect(params).toEqual([]);
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

  it('UT-06: USER entry not accessible — scope replaced by WORKSPACE (SA4E-31)', () => {
    const entry = makeEntry({ scope: 'USER', user_id: 'user-1' });
    expect(validateReadAccess(ctx, entry)).toBeUndefined();
  });

  it('UT-07: USER entry blocked if different userId', () => {
    const entry = makeEntry({ scope: 'USER', user_id: 'user-2' });
    expect(validateReadAccess(ctx, entry)).toBeUndefined();
  });

  it('UT-08: PROJECT entry accessible if same projectId', () => {
    const entry = makeEntry({ scope: 'PROJECT', project_id: 'app-A' });
    expect(validateReadAccess(ctx, entry)).toBe(entry);
  });

  it('UT-09: PROJECT entry with NULL project_id blocked (SA4E-31 — no legacy escape)', () => {
    const entry = makeEntry({ scope: 'PROJECT', project_id: null });
    expect(validateReadAccess(ctx, entry)).toBeUndefined();
  });

  it('UT-10: PROJECT entry blocked if different projectId', () => {
    const entry = makeEntry({ scope: 'PROJECT', project_id: 'app-B' });
    expect(validateReadAccess(ctx, entry)).toBeUndefined();
  });

  it('UT-11: no projectId context fails closed — PROJECT entry blocked (SA4E-31)', () => {
    const noProjectCtx = createProjectContext('', 'user-1');
    const entry = makeEntry({ scope: 'PROJECT', project_id: 'app-B' });
    expect(validateReadAccess(noProjectCtx, entry)).toBeUndefined();
  });
});

describe('SA4E-27 UT — validateMutationOwnership', () => {
  const ctx = createProjectContext('app-A', 'user-1');

  it('UT-12: WORKSPACE entry owned by same user — allowed', () => {
    const entry = makeEntry({ scope: 'WORKSPACE', user_id: 'user-1', project_id: 'app-A' });
    expect(validateMutationOwnership(ctx, entry)).toEqual({ allowed: true });
  });

  it('UT-13: WORKSPACE entry owned by different user — denied', () => {
    const entry = makeEntry({ scope: 'WORKSPACE', user_id: 'user-2', project_id: 'app-A' });
    const result = validateMutationOwnership(ctx, entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('UT-14: PROJECT entry same project — allowed', () => {
    const entry = makeEntry({ scope: 'PROJECT', project_id: 'app-A' });
    expect(validateMutationOwnership(ctx, entry)).toEqual({ allowed: true });
  });

  it('UT-15: PROJECT entry different project — denied', () => {
    const entry = makeEntry({ scope: 'PROJECT', project_id: 'app-B' });
    const result = validateMutationOwnership(ctx, entry);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('UT-16: PROJECT entry NULL project_id — denied (SA4E-31, no legacy escape)', () => {
    const entry = makeEntry({ scope: 'PROJECT', project_id: null });
    expect(validateMutationOwnership(ctx, entry).allowed).toBe(false);
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
