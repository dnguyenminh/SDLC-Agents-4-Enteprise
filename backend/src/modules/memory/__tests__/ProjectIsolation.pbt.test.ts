/**
 * SA4E-26 - Project Isolation Tests.
 * This file: PBT (property-based) scope clause properties (real SQLite via testkit).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { makeTempDb, type TempDb } from '../../../__tests__/sa4e-testkit.js';
import { MemoryEngine } from '../engine/index.js';
import type { ScopeContext } from '../models.js';

// --- PBT — Property-Based Testing (4 tests) ---

describe('SA4E-26 PBT — Scope Clause Properties', () => {
  let ctx: TempDb;
  let engine: MemoryEngine;

  beforeEach(async () => { ctx = await makeTempDb(); engine = ctx.engine; });
  afterEach(async () => { await ctx.close(); });

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

  it('PBT-04: Insert always stores project_id from context', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        content: fc.string({ minLength: 1, maxLength: 200 }),
        project_id: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
      }),
      async (entry) => {
        const pid = entry.project_id && entry.project_id.trim().length > 0 ? entry.project_id : null;
        const id = await engine.insert({
          content: entry.content,
          summary: entry.content.slice(0, 50),
          type: 'CONTEXT',
          project_id: pid,
        });
        const row = await engine.findById(id);
        expect(row?.project_id ?? null).toBe(pid ?? null);
      },
    ), { numRuns: 100 });
  });
});
