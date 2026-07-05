/**
 * Property-Based Tests — Slash Menu filter, state machine, trigger detection
 * KSA-254
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
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 5 }),
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

// ============================================================
// PBT — State Machine properties
// ============================================================
describe('PBT — Slash State Machine', () => {
  type State = 'CLOSED' | 'OPEN' | 'FILTERING';
  type Trigger = 'SLASH_TYPED' | 'CHAR_TYPED' | 'FILTER_CLEARED' | 'AGENT_SELECTED' | 'STEERING_SELECTED' | 'DISMISS';

  const ALL_STATES: State[] = ['CLOSED', 'OPEN', 'FILTERING'];
  const ALL_TRIGGERS: Trigger[] = ['SLASH_TYPED', 'CHAR_TYPED', 'FILTER_CLEARED', 'AGENT_SELECTED', 'STEERING_SELECTED', 'DISMISS'];

  const TRANSITIONS: { from: State; to: State; trigger: Trigger }[] = [
    { from: 'CLOSED', to: 'OPEN', trigger: 'SLASH_TYPED' },
    { from: 'OPEN', to: 'FILTERING', trigger: 'CHAR_TYPED' },
    { from: 'OPEN', to: 'CLOSED', trigger: 'AGENT_SELECTED' },
    { from: 'OPEN', to: 'CLOSED', trigger: 'STEERING_SELECTED' },
    { from: 'OPEN', to: 'CLOSED', trigger: 'DISMISS' },
    { from: 'FILTERING', to: 'OPEN', trigger: 'FILTER_CLEARED' },
    { from: 'FILTERING', to: 'CLOSED', trigger: 'AGENT_SELECTED' },
    { from: 'FILTERING', to: 'CLOSED', trigger: 'STEERING_SELECTED' },
    { from: 'FILTERING', to: 'CLOSED', trigger: 'DISMISS' },
  ];

  function transition(state: State, trigger: Trigger): State {
    const valid = TRANSITIONS.find((t) => t.from === state && t.trigger === trigger);
    return valid ? valid.to : state;
  }

  // PBT-06: DISMISS from any open state leads to CLOSED
  it('PBT-06: DISMISS from OPEN or FILTERING always leads to CLOSED', () => {
    for (const state of ALL_STATES) {
      const result = transition(state, 'DISMISS');
      if (state === 'OPEN' || state === 'FILTERING') {
        expect(result).toBe('CLOSED');
      } else {
        expect(result).toBe('CLOSED');
      }
    }
  });

  // PBT-07: Random trigger sequences always end in a valid state
  it('PBT-07: random trigger sequences always produce valid states', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...ALL_TRIGGERS), { minLength: 1, maxLength: 20 }),
        (triggers) => {
          let state: State = 'CLOSED';
          for (const trigger of triggers) {
            state = transition(state, trigger);
          }
          return ALL_STATES.includes(state);
        }
      ),
      { numRuns: 1000 }
    );
  });

  // PBT-08: Undefined transitions are stable (no-op)
  it('PBT-08: undefined transitions leave state unchanged', () => {
    for (const state of ALL_STATES) {
      for (const trigger of ALL_TRIGGERS) {
        const defined = TRANSITIONS.some((t) => t.from === state && t.trigger === trigger);
        if (!defined) {
          expect(transition(state, trigger)).toBe(state);
        }
      }
    }
  });

  // PBT-09: CLOSED is reachable from every state within 1 trigger
  it('PBT-09: CLOSED reachable from every state via DISMISS', () => {
    for (const state of ALL_STATES) {
      if (state === 'CLOSED') continue;
      expect(transition(state, 'DISMISS')).toBe('CLOSED');
    }
  });
});

// ============================================================
// PBT — Trigger detection
// ============================================================
describe('PBT — Slash Trigger Detection', () => {
  function isValidTrigger(text: string, slashPos: number): boolean {
    if (slashPos === 0) return true;
    const charBefore = text[slashPos - 1];
    return charBefore === ' ' || charBefore === '\t' || charBefore === '\n';
  }

  // PBT-10: Position 0 is always valid regardless of text
  it('PBT-10: position 0 always valid', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        (text) => {
          return isValidTrigger('/' + text, 0) === true;
        }
      ),
      { numRuns: 200 }
    );
  });

  // PBT-11: After whitespace always valid
  it('PBT-11: after whitespace always valid', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.constantFrom(' ', '\t', '\n'),
        (prefix, ws) => {
          const text = prefix + ws + '/';
          const slashPos = text.length - 1;
          return isValidTrigger(text, slashPos) === true;
        }
      ),
      { numRuns: 300 }
    );
  });

  // PBT-12: After non-whitespace/non-start is always invalid
  it('PBT-12: after non-whitespace character is invalid', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 10 }),
        (prefix) => {
          const text = prefix + '/';
          const slashPos = text.length - 1;
          return isValidTrigger(text, slashPos) === false;
        }
      ),
      { numRuns: 300 }
    );
  });
});
