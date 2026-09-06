import { describe, it, expect } from 'vitest';
import { matchesWildcard } from '../utils/wildcardMatcher';
import { filterStore } from '../stores/filterStore';

describe('Filter integration', () => {
  it('wildcard filter realtime', () => {
    const types = ['ACTIVITY', 'CLASS', 'ACTION', 'DECISION'];
    filterStore.setQuery('ACT*');
    let state;
    filterStore.subscribe(s => state = s)();
    const filtered = types.filter(t => matchesWildcard(t, state.query));
    expect(filtered).toEqual(['ACTIVITY', 'ACTION']);
  });
});
