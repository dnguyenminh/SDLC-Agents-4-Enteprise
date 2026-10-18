/**
 * Property-Based Tests — Slash Menu state machine, trigger detection
 * KSA-254
 * Split from slash-menu.pbt.test.ts (state machine + trigger concerns).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

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
        fc.string({ base: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), minLength: 1, maxLength: 10 }).filter((p) => !/\s$/.test(p)),
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
