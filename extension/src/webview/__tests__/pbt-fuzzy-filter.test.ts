/**
 * Property-Based Tests — FuzzyFilter
 * KSA-252 — STC PBT-01 through PBT-05, PBT-12
 * Split from pbt.test.ts (filter concerns).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { fuzzyMatch, filterItems } from '../context-menu/FuzzyFilter';

describe('PBT — FuzzyFilter', () => {
  // PBT-01: Subset property — filter(items, q1+q2) ⊆ filter(items, q1)
  it('PBT-01: additional query chars only narrow results (subset property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 5 }),
        fc.string({ minLength: 1, maxLength: 5 }),
        (labels, q1, q2) => {
          const items = labels.map(l => ({ label: l }));
          const r1 = filterItems(items, q1);
          const r2 = filterItems(items, q1 + q2);
          const r1Labels = r1.map(i => i.label);
          return r2.every(item => r1Labels.includes(item.label));
        }
      ),
      { numRuns: 1000 }
    );
  });

  // PBT-02: Empty query returns all items
  it('PBT-02: empty query returns all items unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 20 }),
        (labels) => {
          const items = labels.map(l => ({ label: l }));
          const result = filterItems(items, '');
          return result.length === items.length;
        }
      ),
      { numRuns: 500 }
    );
  });

  // PBT-03: Performance bound — filter completes within 50ms for N <= 1000
  it('PBT-03: filter(N items, query) completes within 50ms for N <= 1000', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 100, maxLength: 1000 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (labels, query) => {
          const items = labels.map(l => ({ label: l }));
          const start = performance.now();
          filterItems(items, query);
          const elapsed = performance.now() - start;
          return elapsed < 50;
        }
      ),
      { numRuns: 100 }
    );
  });

  // PBT-04: Idempotency — filter(filter(items,q),q) same results as filter(items,q)
  it('PBT-04: filtering is idempotent', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 5 }),
        (labels, query) => {
          const items = labels.map(l => ({ label: l }));
          const first = filterItems(items, query);
          const second = filterItems(first, query);
          return second.length === first.length &&
            second.every((item, i) => item.label === first[i].label);
        }
      ),
      { numRuns: 500 }
    );
  });

  // PBT-05: Prefix bonus — items starting with query score higher than mid-match
  it('PBT-05: prefix matches score higher than mid-string matches', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 5 }),
        fc.string({ minLength: 2, maxLength: 10 }),
        (query, suffix) => {
          const prefixItem = { label: query + suffix };
          const midItem = { label: suffix + query + suffix };
          const prefixResult = fuzzyMatch(prefixItem.label, query);
          const midResult = fuzzyMatch(midItem.label, query);
          if (!prefixResult.match || !midResult.match) return true; // skip non-matches
          return prefixResult.score >= midResult.score;
        }
      ),
      { numRuns: 500 }
    );
  });

  // PBT-12: Case insensitivity
  it('PBT-12: filter is case-insensitive', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 1, maxLength: 20 }),
        fc.string({ base: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), minLength: 1, maxLength: 5 }),
        (labels, query) => {
          const items = labels.map(l => ({ label: l }));
          const lowerResults = filterItems(items, query.toLowerCase());
          const upperResults = filterItems(items, query.toUpperCase());
          return lowerResults.length === upperResults.length &&
            lowerResults.every((r, i) => r.label === upperResults[i].label);
        }
      ),
      { numRuns: 500 }
    );
  });
});
