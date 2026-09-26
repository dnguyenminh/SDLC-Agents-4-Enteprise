import { describe, it, expect } from 'vitest';
import { Ranker } from '../ranker';
import type { SearchCandidate } from '../types';

function candidate(overrides: Partial<SearchCandidate>): SearchCandidate {
  return {
    name: 'unknown',
    filePath: 'src/unknown.ts',
    kind: 'function',
    source: 'code_search',
    ...overrides,
  };
}

describe('Ranker.rankSymbols', () => {
  const ranker = new Ranker();

  it('ranks symbol-name matches above unrelated symbols', () => {
    const ranked = ranker.rankSymbols(
      [
        candidate({ name: 'computeBudget', filePath: 'src/budget.ts' }),
        candidate({ name: 'unrelatedThing', filePath: 'src/other.ts' }),
      ],
      'how does computeBudget work'
    );
    expect(ranked[0].name).toBe('computeBudget');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
  });

  it('gives kind weight to classes and interfaces', () => {
    const ranked = ranker.rankSymbols(
      [
        candidate({ name: 'zzz', kind: 'variable', filePath: 'src/a.ts' }),
        candidate({ name: 'zzz', kind: 'class', filePath: 'src/b.ts' }),
      ],
      'zzz'
    );
    expect(ranked[0].kind).toBe('class');
  });

  it('deduplicates candidates with same file and name', () => {
    const ranked = ranker.rankSymbols(
      [
        candidate({ name: 'login', filePath: 'src/auth.ts' }),
        candidate({ name: 'login', filePath: 'src/auth.ts', source: 'mem_search' }),
        candidate({ name: 'login', filePath: 'src/other.ts' }),
      ],
      'login'
    );
    expect(ranked).toHaveLength(2);
  });

  it('assigns sequential ranks starting at 1', () => {
    const ranked = ranker.rankSymbols(
      [1, 2, 3].map((i) => candidate({ name: `sym${i}` })),
      'sym'
    );
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('uses file path match as a secondary signal', () => {
    const ranked = ranker.rankSymbols(
      [
        candidate({ name: 'alpha', filePath: 'src/auth.ts' }),
        candidate({ name: 'beta', filePath: 'src/other.ts' }),
      ],
      'auth flow'
    );
    expect(ranked[0].filePath).toContain('auth');
  });

  it('handles empty input', () => {
    expect(ranker.rankSymbols([], 'anything')).toEqual([]);
  });
});
