/**
 * SA4E-27 — IsolationLayer Unit Tests (property-based).
 * Tests the centralized scope enforcement module (pure functions).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildReadFilter,
  validateMutationOwnership,
  validateReadAccess,
} from '../IsolationLayer.js';
import { createProjectContext } from '../ProjectContext.js';
import { makeEntry } from './helpers.js';

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
