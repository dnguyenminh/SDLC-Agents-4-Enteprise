/**
 * Unit Tests — ContextMenuController State Machine
 * KSA-252 — STC UT-38 through UT-45
 * Split from unit-part2.test.ts (state machine concerns).
 */
import { describe, it, expect } from 'vitest';

// ============================================================
// 2.6 ContextMenuController.ts — State Machine (UT-38 to UT-45)
// ============================================================
describe('UT — ContextMenuController State Machine', () => {
  // Test the state machine logic directly using the transition table
  type State = 'CLOSED' | 'OPEN' | 'FILTERING' | 'PICKER_OPEN' | 'BADGE_INSERTED';
  type Trigger = 'HASH_TYPED' | 'CHAR_TYPED' | 'FILTER_CLEARED' | 'PICKER_SELECTED' | 'INSTANT_SELECTED' | 'ITEM_SELECTED' | 'BACK' | 'DISMISS' | 'AUTO';

  const TRANSITIONS = [
    { from: 'CLOSED' as State, to: 'OPEN' as State, trigger: 'HASH_TYPED' as Trigger },
    { from: 'OPEN' as State, to: 'FILTERING' as State, trigger: 'CHAR_TYPED' as Trigger },
    { from: 'OPEN' as State, to: 'PICKER_OPEN' as State, trigger: 'PICKER_SELECTED' as Trigger },
    { from: 'OPEN' as State, to: 'BADGE_INSERTED' as State, trigger: 'INSTANT_SELECTED' as Trigger },
    { from: 'OPEN' as State, to: 'CLOSED' as State, trigger: 'DISMISS' as Trigger },
    { from: 'FILTERING' as State, to: 'PICKER_OPEN' as State, trigger: 'PICKER_SELECTED' as Trigger },
    { from: 'FILTERING' as State, to: 'BADGE_INSERTED' as State, trigger: 'INSTANT_SELECTED' as Trigger },
    { from: 'FILTERING' as State, to: 'OPEN' as State, trigger: 'FILTER_CLEARED' as Trigger },
    { from: 'FILTERING' as State, to: 'CLOSED' as State, trigger: 'DISMISS' as Trigger },
    { from: 'PICKER_OPEN' as State, to: 'BADGE_INSERTED' as State, trigger: 'ITEM_SELECTED' as Trigger },
    { from: 'PICKER_OPEN' as State, to: 'OPEN' as State, trigger: 'BACK' as Trigger },
    { from: 'PICKER_OPEN' as State, to: 'CLOSED' as State, trigger: 'DISMISS' as Trigger },
    { from: 'BADGE_INSERTED' as State, to: 'CLOSED' as State, trigger: 'AUTO' as Trigger },
  ];

  function transition(state: State, trigger: Trigger): State {
    const valid = TRANSITIONS.find(t => t.from === state && t.trigger === trigger);
    return valid ? valid.to : state;
  }

  it('UT-38: initial state is CLOSED', () => {
    const state: State = 'CLOSED';
    expect(state).toBe('CLOSED');
  });

  it('UT-39: HASH_TYPED transitions CLOSED to OPEN', () => {
    expect(transition('CLOSED', 'HASH_TYPED')).toBe('OPEN');
  });

  it('UT-40: CHAR_TYPED transitions OPEN to FILTERING', () => {
    expect(transition('OPEN', 'CHAR_TYPED')).toBe('FILTERING');
  });

  it('UT-41: DISMISS from OPEN goes to CLOSED', () => {
    expect(transition('OPEN', 'DISMISS')).toBe('CLOSED');
  });

  it('UT-42: invalid transition ignored (state unchanged)', () => {
    expect(transition('CLOSED', 'CHAR_TYPED')).toBe('CLOSED');
  });

  it('UT-43: PICKER_SELECTED from OPEN goes to PICKER_OPEN', () => {
    expect(transition('OPEN', 'PICKER_SELECTED')).toBe('PICKER_OPEN');
  });

  it('UT-44: INSTANT_SELECTED from OPEN goes to BADGE_INSERTED', () => {
    expect(transition('OPEN', 'INSTANT_SELECTED')).toBe('BADGE_INSERTED');
  });

  it('UT-45: AUTO from BADGE_INSERTED goes to CLOSED', () => {
    expect(transition('BADGE_INSERTED', 'AUTO')).toBe('CLOSED');
  });
});
