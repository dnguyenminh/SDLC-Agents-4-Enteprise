import { describe, it, expect } from 'vitest';
import { matchesWildcard, filterByWildcard } from '../../../src/viewer/admin/utils/wildcardMatcher.js';

describe('wildcardMatcher', () => {
  it('matches exact string', () => {
    expect(matchesWildcard('ACTIVITY', 'ACTIVITY')).toBe(true);
  });

  it('case insensitive', () => {
    expect(matchesWildcard('activity', 'ACTIVITY')).toBe(true);
  });

  it('wildcard * matches any sequence', () => {
    expect(matchesWildcard('ACTIVITY', 'ACT*')).toBe(true);
    expect(matchesWildcard('ACTION', 'ACT*')).toBe(true);
    expect(matchesWildcard('ACT', 'ACT*')).toBe(true);
  });

  it('wildcard ? matches single char', () => {
    expect(matchesWildcard('ACTIVITY', 'ACT?VITY')).toBe(true);
    expect(matchesWildcard('ACTXITY', 'ACT?ITY')).toBe(true);
  });

  it('empty pattern matches all', () => {
    expect(matchesWildcard('anything', '')).toBe(true);
  });

  it('filterByWildcard returns items matching pattern', () => {
    const items = [{type:'ACTIVITY'},{type:'ACTION'},{type:'FLOW'}];
    const result = filterByWildcard(items, 'ACT*');
    expect(result).toHaveLength(2);
    expect(result.map(i=>i.type)).toContain('ACTIVITY');
    expect(result.map(i=>i.type)).toContain('ACTION');
  });
});
