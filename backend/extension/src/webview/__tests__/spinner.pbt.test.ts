/**
 * Property-Based Tests — SpinnerController State Machine
 * KSA-255 — State invariants, idempotency, timeout guarantees
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { SpinnerState, SpinnerTrigger } from '../spinner/types';
import { SPINNER_TRANSITIONS } from '../spinner/types';

// Pure state machine function for PBT (no DOM dependency)
function transition(state: SpinnerState, trigger: SpinnerTrigger): SpinnerState {
  const valid = SPINNER_TRANSITIONS.find(t => t.from === state && t.trigger === trigger);
  return valid ? valid.to : state;
}

const ALL_STATES: SpinnerState[] = ['READY', 'PROCESSING'];
const ALL_TRIGGERS: SpinnerTrigger[] = ['START', 'STOP'];

describe('PBT — Spinner State Machine', () => {
  // PBT-01: State is always one of the 2 valid states
  it('PBT-01: state is always READY or PROCESSING after any sequence of transitions', () => {
    const triggerArb = fc.constantFrom<SpinnerTrigger>('START', 'STOP');

    fc.assert(
      fc.property(
        fc.array(triggerArb, { minLength: 1, maxLength: 100 }),
        (triggers) => {
          let state: SpinnerState = 'READY';
          for (const trigger of triggers) {
            state = transition(state, trigger);
          }
          return ALL_STATES.includes(state);
        }
      ),
      { numRuns: 1000 }
    );
  });

  // PBT-02: Idempotent START — multiple START from PROCESSING = no change
  it('PBT-02: START is idempotent (repeated START stays PROCESSING)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 50 }),
        (n) => {
          let state: SpinnerState = 'READY';
          state = transition(state, 'START'); // → PROCESSING
          for (let i = 0; i < n; i++) {
            state = transition(state, 'START'); // idempotent
          }
          return state === 'PROCESSING';
        }
      ),
      { numRuns: 500 }
    );
  });

  // PBT-03: Idempotent STOP — multiple STOP from READY = no change
  it('PBT-03: STOP is idempotent (repeated STOP stays READY)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (n) => {
          let state: SpinnerState = 'READY';
          for (let i = 0; i < n; i++) {
            state = transition(state, 'STOP'); // idempotent from READY
          }
          return state === 'READY';
        }
      ),
      { numRuns: 500 }
    );
  });

  // PBT-04: Round-trip — START then STOP always returns to READY
  it('PBT-04: START followed by STOP always returns to READY', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (n) => {
          let state: SpinnerState = 'READY';
          for (let i = 0; i < n; i++) {
            state = transition(state, 'START');
            state = transition(state, 'STOP');
          }
          return state === 'READY';
        }
      ),
      { numRuns: 500 }
    );
  });

  // PBT-05: From any state, applying all triggers eventually leads to a valid state
  it('PBT-05: random trigger sequences always produce valid states', () => {
    const triggerArb = fc.constantFrom<SpinnerTrigger>('START', 'STOP');
    const stateArb = fc.constantFrom<SpinnerState>('READY', 'PROCESSING');

    fc.assert(
      fc.property(
        stateArb,
        fc.array(triggerArb, { minLength: 1, maxLength: 200 }),
        (initialState, triggers) => {
          let state = initialState;
          for (const trigger of triggers) {
            state = transition(state, trigger);
            if (!ALL_STATES.includes(state)) return false;
          }
          return true;
        }
      ),
      { numRuns: 1000 }
    );
  });

  // PBT-06: STOP from PROCESSING always goes to READY (never stays PROCESSING)
  it('PBT-06: STOP from PROCESSING always transitions to READY', () => {
    for (const trigger of ALL_TRIGGERS) {
      const result = transition('PROCESSING', trigger);
      if (trigger === 'STOP') {
        expect(result).toBe('READY');
      }
    }
  });

  // PBT-07: Undefined transitions don't change state
  it('PBT-07: invalid transitions are no-ops', () => {
    // START from PROCESSING should be no-op
    expect(transition('PROCESSING', 'START')).toBe('PROCESSING');
    // STOP from READY should be no-op
    expect(transition('READY', 'STOP')).toBe('READY');
  });

  // PBT-08: Alternating START/STOP produces oscillation
  it('PBT-08: alternating triggers produce correct oscillation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (n) => {
          let state: SpinnerState = 'READY';
          for (let i = 0; i < n; i++) {
            state = transition(state, 'START');
            if (state !== 'PROCESSING') return false;
            state = transition(state, 'STOP');
            if (state !== 'READY') return false;
          }
          return true;
        }
      ),
      { numRuns: 500 }
    );
  });
});
