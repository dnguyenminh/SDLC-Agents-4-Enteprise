import { describe, it, expect } from 'vitest';
import { safeWildcardToRegExp, matchesWildcard } from '../utils/wildcardMatcher';

describe('wildcardMatcher', () => {
  it('matches exact', () => {
    expect(matchesWildcard('ACTIVITY', 'ACTIVITY')).toBe(true);
  });
  it('matches prefix with *', () => {
    expect(matchesWildcard('ACTIVITY', 'ACT*')).toBe(true);
  });
  it('matches suffix with *', () => {
    expect(matchesWildcard('ACTIVITY', '*ITY')).toBe(true);
  });
  it('matches single char ?', () => {
    expect(matchesWildcard('ACTIVITY', 'ACT?VITY')).toBe(true);
  });
  it('case insensitive', () => {
    expect(matchesWildcard('activity', 'ACT*')).toBe(true);
  });
  it('empty pattern matches all', () => {
    expect(matchesWildcard('ANY', '')).toBe(true);
  });
  it('pattern too long returns false', () => {
    const long = 'a'.repeat(200);
    expect(matchesWildcard('ANY', long)).toBe(false);
  });
  it('safeWildcardToRegExp escapes meta', () => {
    const re = safeWildcardToRegExp('A+B*');
    expect(re).not.toBeNull();
    expect(re!.test('A+Bxyz')).toBe(true);
  });
});
