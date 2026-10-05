/**
 * TokenBudgetManager unit tests — estimation, budget math, truncation, assemble.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TokenBudgetManager } from '../token-budget-manager.js';

describe('TokenBudgetManager construction', () => {
  it('enforces a minimum budget of 500 tokens', () => {
    expect(new TokenBudgetManager(10).remaining()).toBe(500);
  });

  it('keeps budgets above the minimum', () => {
    expect(new TokenBudgetManager(1000).remaining()).toBe(1000);
  });
});

describe('TokenBudgetManager.estimateTokens', () => {
  it('estimates ~3 chars per token for strings (OI-03 / FSD §5.6.6)', () => {
    const m = new TokenBudgetManager(500);
    expect(m.estimateTokens('abc')).toBe(1);
    expect(m.estimateTokens('')).toBe(0);
    expect(m.estimateTokens('abcd')).toBe(2);
    expect(m.estimateTokens('a'.repeat(300))).toBe(100);
  });

  it('JSON-stringifies non-string content', () => {
    const m = new TokenBudgetManager(500);
    expect(m.estimateTokens({ a: 1 })).toBe(Math.ceil('{"a":1}'.length / 3));
    expect(m.estimateTokens([1, 2])).toBe(Math.ceil('[1,2]'.length / 3));
  });
});

describe('TokenBudgetManager budget math', () => {
  let m: TokenBudgetManager;
  beforeEach(() => { m = new TokenBudgetManager(1000); });

  it('canFit respects the consumed amount', () => {
    expect(m.canFit(1000)).toBe(true);
    m.consume(600);
    expect(m.canFit(400)).toBe(true);
    expect(m.canFit(401)).toBe(false);
  });

  it('tracks consumed and remaining tokens', () => {
    expect(m.used()).toBe(0);
    m.consume(250);
    expect(m.used()).toBe(250);
    expect(m.remaining()).toBe(750);
  });

  it('consumeAll marks the budget as fully consumed', () => {
    m.consumeAll();
    expect(m.used()).toBe(1000);
    expect(m.remaining()).toBe(0);
  });

  it('never reports negative remaining', () => {
    m.consume(1500);
    expect(m.remaining()).toBe(0);
  });

  it('isExhausted when fewer than 50 tokens remain', () => {
    m.consume(950);
    expect(m.remaining()).toBe(50);
    expect(m.isExhausted()).toBe(false);
    m.consume(1);
    expect(m.remaining()).toBe(49);
    expect(m.isExhausted()).toBe(true);
  });
});

describe('TokenBudgetManager.truncateToFit', () => {
  it('returns strings shorter than the remaining budget unchanged', () => {
    const m = new TokenBudgetManager(1000);
    expect(m.truncateToFit('short')).toBe('short');
  });

  it('truncates long strings and appends a marker', () => {
    const m = new TokenBudgetManager(1000);
    m.consume(980);
    const out = m.truncateToFit('x'.repeat(100));
    expect(out).toBe('x'.repeat(80) + '\n... (truncated)');
  });

  it('truncates arrays to the first fitting items', () => {
    const m = new TokenBudgetManager(1000);
    m.consume(990);
    const out = m.truncateToFit(['a'.repeat(1000), 'bb', 'cc']);
    expect(Array.isArray(out)).toBe(true);
    expect(out).toEqual([]);
  });

  it('keeps arrays within budget intact', () => {
    const m = new TokenBudgetManager(1000);
    m.consume(500);
    const out = m.truncateToFit(['a', 'b']);
    expect(out).toEqual(['a', 'b']);
  });

  it('truncates plain objects to a JSON prefix', () => {
    const m = new TokenBudgetManager(1000);
    m.consume(900);
    const out = m.truncateToFit({ huge: 'y'.repeat(1000) });
    expect(typeof out).toBe('string');
    expect(out.length).toBe(400);
  });
});

describe('TokenBudgetManager.assemble', () => {
  it('includes sections in priority order', () => {
    const m = new TokenBudgetManager(500);
    const { result, tokenCount, included, excluded } = m.assemble({
      low: { content: 'hello', priority: 2 },
      high: { content: 'world', priority: 1 },
    }, 100);
    expect(Object.keys(result)).toEqual(['high', 'low']);
    expect(included).toEqual(['high', 'low']);
    expect(excluded).toEqual([]);
    expect(tokenCount).toBeGreaterThan(0);
  });

  it('excludes an over-budget non-array section', () => {
    const m = new TokenBudgetManager(500);
    const { result, included, excluded } = m.assemble({
      big: { content: 'a'.repeat(1000), priority: 1 },
      small: { content: 'b', priority: 2 },
    }, 200);
    expect(result).toEqual({ small: 'b' });
    expect(included).toEqual(['small']);
    expect(excluded).toEqual(['big']);
  });

  it('filters out null and undefined content entirely', () => {
    const m = new TokenBudgetManager(500);
    const { result, included, excluded } = m.assemble({
      nil: { content: null, priority: 1 },
      undef: { content: undefined, priority: 2 },
      real: { content: 'x', priority: 3 },
    }, 100);
    expect(result).toEqual({ real: 'x' });
    expect(included).toEqual(['real']);
    expect(excluded).toEqual([]);
  });

  it('truncates oversized arrays instead of excluding them', () => {
    const m = new TokenBudgetManager(500);
    const { result, included, excluded } = m.assemble({
      items: { content: ['x', 'y'.repeat(1000)], priority: 1 },
    }, 150);
    expect(result.items).toEqual(['x']);
    expect(included[0]).toContain('truncated');
    expect(excluded).toEqual([]);
  });

  it('excludes an array when not even one item fits', () => {
    const m = new TokenBudgetManager(500);
    const { result, included, excluded } = m.assemble({
      items: { content: ['a'.repeat(1000)], priority: 1 },
    }, 100);
    expect(result.items).toBeUndefined();
    expect(included).toEqual([]);
    expect(excluded).toEqual(['items']);
  });
});