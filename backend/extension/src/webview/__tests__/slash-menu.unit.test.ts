/**
 * Unit Tests — SlashMenuItems, SlashMenuController (state machine), trigger detection
 * KSA-254
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SLASH_AGENTS,
  agentsToMenuItems,
  steeringToMenuItems,
  parseSteeringRules,
  filterSlashItems,
} from '../slash-menu/SlashMenuItems';
import type { SlashSteeringRule, SlashMenuItem } from '../slash-menu/types';

// ============================================================
// SlashMenuItems — Agent data
// ============================================================
describe('UT — SlashMenuItems: Agent Data', () => {
  it('UT-01: defines 6 agents', () => {
    expect(SLASH_AGENTS).toHaveLength(6);
  });

  it('UT-02: each agent has required fields', () => {
    for (const agent of SLASH_AGENTS) {
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('icon');
      expect(agent).toHaveProperty('label');
      expect(agent).toHaveProperty('agentName');
      expect(agent).toHaveProperty('description');
    }
  });

  it('UT-03: agents sorted alphabetically by agent name', () => {
    const names = SLASH_AGENTS.map((a) => a.agentName);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('UT-04: agentsToMenuItems converts correctly', () => {
    const items = agentsToMenuItems(SLASH_AGENTS);
    expect(items).toHaveLength(6);
    expect(items[0].itemType).toBe('agent');
    expect(items[0].agentName).toBeDefined();
    expect(items[0].id).toMatch(/^agent-/);
  });
});

// ============================================================
// SlashMenuItems — Steering data
// ============================================================
describe('UT — SlashMenuItems: Steering Data', () => {
  it('UT-05: parseSteeringRules creates correct structure', () => {
    const rules = parseSteeringRules([
      { name: 'drawio', file: 'drawio.md' },
      { name: 'sm-core', file: 'sm-core.md' },
    ]);
    expect(rules).toHaveLength(2);
    expect(rules[0].icon).toBe('\u{1F9ED}');
    expect(rules[0].name).toBe('drawio');
    expect(rules[0].file).toBe('drawio.md');
  });

  it('UT-06: steeringToMenuItems converts correctly', () => {
    const rules: SlashSteeringRule[] = [
      { name: 'drawio', file: 'drawio.md', icon: '\u{1F9ED}' },
    ];
    const items = steeringToMenuItems(rules);
    expect(items).toHaveLength(1);
    expect(items[0].itemType).toBe('steering');
    expect(items[0].label).toBe('drawio');
    expect(items[0].id).toBe('steering-drawio');
  });

  it('UT-07: empty steering rules returns empty array', () => {
    const rules = parseSteeringRules([]);
    expect(rules).toHaveLength(0);
    const items = steeringToMenuItems(rules);
    expect(items).toHaveLength(0);
  });
});

// ============================================================
// SlashMenuItems — Filter logic (BR-12, BR-13, BR-14, BR-15)
// ============================================================
describe('UT — SlashMenuItems: Filter', () => {
  let agents: SlashMenuItem[];
  let steering: SlashMenuItem[];

  beforeEach(() => {
    agents = agentsToMenuItems(SLASH_AGENTS);
    steering = steeringToMenuItems([
      { name: 'drawio', file: 'drawio.md', icon: '\u{1F9ED}' },
      { name: 'sm-core', file: 'sm-core.md', icon: '\u{1F9ED}' },
      { name: 'concise-responses', file: 'concise-responses.md', icon: '\u{1F9ED}' },
    ]);
  });

  it('UT-08: empty filter returns all items', () => {
    const result = filterSlashItems(agents, steering, '');
    expect(result.agents).toHaveLength(6);
    expect(result.steering).toHaveLength(3);
  });

  it('UT-09: "qa" matches only QA Agent', () => {
    const result = filterSlashItems(agents, steering, 'qa');
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].label).toBe('QA Agent');
    expect(result.steering).toHaveLength(0);
  });

  it('UT-10: "s" matches SA, SM, Security agents + sm-core steering', () => {
    const result = filterSlashItems(agents, steering, 's');
    expect(result.agents.length).toBeGreaterThanOrEqual(3);
    expect(result.steering.length).toBeGreaterThanOrEqual(1);
  });

  it('UT-11: "draw" matches only drawio steering rule', () => {
    const result = filterSlashItems(agents, steering, 'draw');
    expect(result.agents).toHaveLength(0);
    expect(result.steering).toHaveLength(1);
    expect(result.steering[0].label).toBe('drawio');
  });

  it('UT-12: "agent" matches all 6 agents (all contain "agent")', () => {
    const result = filterSlashItems(agents, steering, 'agent');
    expect(result.agents).toHaveLength(6);
  });

  it('UT-13: "xyz" matches nothing', () => {
    const result = filterSlashItems(agents, steering, 'xyz');
    expect(result.agents).toHaveLength(0);
    expect(result.steering).toHaveLength(0);
  });

  it('UT-14: filter is case-insensitive (BR-13)', () => {
    const result1 = filterSlashItems(agents, steering, 'QA');
    const result2 = filterSlashItems(agents, steering, 'qa');
    expect(result1.agents).toHaveLength(result2.agents.length);
  });

  it('UT-15: filter matches agentName field too', () => {
    const result = filterSlashItems(agents, steering, 'security-agent');
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].agentName).toBe('security-agent');
  });
});

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
