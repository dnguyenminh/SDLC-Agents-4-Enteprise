/**
 * Property-Based Tests — Slash Menu filter
 * KSA-254
 * Split from slash-menu.pbt.test.ts (filter concerns).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  SLASH_AGENTS,
  agentsToMenuItems,
  steeringToMenuItems,
  filterSlashItems,
} from '../slash-menu/SlashMenuItems';

// ============================================================
// PBT — Filter properties
// ============================================================
describe('PBT — Slash Filter', () => {
  const agents = agentsToMenuItems(SLASH_AGENTS);
  const steering = steeringToMenuItems([
    { name: 'drawio', file: 'drawio.md', icon: '\u{1F9ED}' },
    { name: 'sm-core', file: 'sm-core.md', icon: '\u{1F9ED}' },
    { name: 'concise-responses', file: 'concise-responses.md', icon: '\u{1F9ED}' },
    { name: 'phase-1-requirements', file: 'phase-1-requirements.md', icon: '\u{1F9ED}' },
  ]);

  // PBT-01: Subset property — adding chars to query only narrows results
  it('PBT-01: additional chars only narrow results (subset property)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 5 }),
        fc.string({ minLength: 1, maxLength: 5 }),
        (q1, q2) => {
          const r1 = filterSlashItems(agents, steering, q1);
          const r2 = filterSlashItems(agents, steering, q1 + q2);
          const r1All = [...r1.agents, ...r1.steering].map((i) => i.id);
          const r2All = [...r2.agents, ...r2.steering];
          return r2All.every((item) => r1All.includes(item.id));
        }
      ),
      { numRuns: 500 }
    );
  });

  // PBT-02: Empty query returns all items
  it('PBT-02: empty query returns all items', () => {
    const result = filterSlashItems(agents, steering, '');
    expect(result.agents).toHaveLength(agents.length);
    expect(result.steering).toHaveLength(steering.length);
  });

  // PBT-03: Filter is case-insensitive
  it('PBT-03: filter is case-insensitive', () => {
    fc.assert(
      fc.property(
        fc.string({ base: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), minLength: 1, maxLength: 5 }),
        (query) => {
          const lower = filterSlashItems(agents, steering, query.toLowerCase());
          const upper = filterSlashItems(agents, steering, query.toUpperCase());
          return lower.agents.length === upper.agents.length &&
            lower.steering.length === upper.steering.length;
        }
      ),
      { numRuns: 300 }
    );
  });

  // PBT-04: Filter result never exceeds total items
  it('PBT-04: filtered count never exceeds total', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 10 }),
        (query) => {
          const result = filterSlashItems(agents, steering, query);
          return result.agents.length <= agents.length &&
            result.steering.length <= steering.length;
        }
      ),
      { numRuns: 500 }
    );
  });

  // PBT-05: Performance — filter completes within 16ms
  it('PBT-05: filter completes within 16ms for any query', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (query) => {
          const start = performance.now();
          filterSlashItems(agents, steering, query);
          const elapsed = performance.now() - start;
          return elapsed < 16;
        }
      ),
      { numRuns: 200 }
    );
  });
});
