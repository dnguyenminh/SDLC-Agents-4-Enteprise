/**
 * Unit Tests — SlashMenuItems (agent data, steering data, filter logic)
 * KSA-254 — UT-01 through UT-15
 * Split from slash-menu.unit.test.ts (items/filter concerns).
 */
import { describe, it, expect, beforeEach } from 'vitest';
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
  it('UT-01: defines 9 agents', () => {
    expect(SLASH_AGENTS).toHaveLength(9);
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
    expect(items).toHaveLength(9);
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
    expect(result.agents).toHaveLength(9);
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

  it('UT-12: "agent" matches all 9 agents (all contain "agent")', () => {
    const result = filterSlashItems(agents, steering, 'agent');
    expect(result.agents).toHaveLength(9);
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
