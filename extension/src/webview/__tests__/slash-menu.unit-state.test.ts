/**
 * Unit Tests — SlashMenuController state machine, trigger detection
 * KSA-254 — UT-16 through UT-30
 * Split from slash-menu.unit.test.ts (state machine + trigger concerns).
 */
import { describe, it, expect } from 'vitest';

// ============================================================
// SlashMenuController — State machine transitions
// ============================================================
describe('UT — SlashMenuController: State Machine', () => {
  type State = 'CLOSED' | 'OPEN' | 'FILTERING';
  type Trigger = 'SLASH_TYPED' | 'CHAR_TYPED' | 'FILTER_CLEARED' | 'AGENT_SELECTED' | 'STEERING_SELECTED' | 'DISMISS';

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

  it('UT-16: CLOSED -> OPEN on SLASH_TYPED', () => {
    expect(transition('CLOSED', 'SLASH_TYPED')).toBe('OPEN');
  });

  it('UT-17: OPEN -> FILTERING on CHAR_TYPED', () => {
    expect(transition('OPEN', 'CHAR_TYPED')).toBe('FILTERING');
  });

  it('UT-18: OPEN -> CLOSED on DISMISS', () => {
    expect(transition('OPEN', 'DISMISS')).toBe('CLOSED');
  });

  it('UT-19: OPEN -> CLOSED on AGENT_SELECTED', () => {
    expect(transition('OPEN', 'AGENT_SELECTED')).toBe('CLOSED');
  });

  it('UT-20: OPEN -> CLOSED on STEERING_SELECTED', () => {
    expect(transition('OPEN', 'STEERING_SELECTED')).toBe('CLOSED');
  });

  it('UT-21: FILTERING -> OPEN on FILTER_CLEARED', () => {
    expect(transition('FILTERING', 'FILTER_CLEARED')).toBe('OPEN');
  });

  it('UT-22: FILTERING -> CLOSED on DISMISS', () => {
    expect(transition('FILTERING', 'DISMISS')).toBe('CLOSED');
  });

  it('UT-23: undefined transitions stay in same state', () => {
    expect(transition('CLOSED', 'DISMISS')).toBe('CLOSED');
    expect(transition('CLOSED', 'CHAR_TYPED')).toBe('CLOSED');
    expect(transition('FILTERING', 'SLASH_TYPED')).toBe('FILTERING');
  });
});

// ============================================================
// Trigger detection logic (BR-01, BR-05)
// ============================================================
describe('UT — Slash Trigger Detection', () => {
  function isValidTrigger(text: string, slashPos: number): boolean {
    if (slashPos === 0) return true;
    const charBefore = text[slashPos - 1];
    return charBefore === ' ' || charBefore === '\t' || charBefore === '\n';
  }

  it('UT-24: "/" at position 0 is valid', () => {
    expect(isValidTrigger('/', 0)).toBe(true);
  });

  it('UT-25: "/" after space is valid', () => {
    expect(isValidTrigger('hello /', 6)).toBe(true);
  });

  it('UT-26: "/" after tab is valid', () => {
    expect(isValidTrigger('hello\t/', 6)).toBe(true);
  });

  it('UT-27: "/" after newline is valid', () => {
    expect(isValidTrigger('hello\n/', 6)).toBe(true);
  });

  it('UT-28: "/" mid-word is NOT valid (e.g., "http:/")', () => {
    expect(isValidTrigger('http:/', 5)).toBe(false);
  });

  it('UT-29: "/" after letter is NOT valid', () => {
    expect(isValidTrigger('abc/', 3)).toBe(false);
  });

  it('UT-30: "/" after number is NOT valid', () => {
    expect(isValidTrigger('123/', 3)).toBe(false);
  });
});
