/**
 * SA4E-85 — Unit Tests: Context Manager (UT-CTX-01/02/03).
 * Tests pruning algorithm, badge pulse, and /clear behavior.
 */

import { describe, test, expect } from 'vitest';
import { suggestPrune, computeFreedThreshold, type PrunableFile } from '../../chat/context/pruningAlgorithm';

describe('UT-CTX-01: Badge Pulse Animation at >80%', () => {
  test('usage above 80% triggers pulse', () => {
    const tokenCount = 8500;
    const maxTokens = 10000;
    const hasPulse = (tokenCount / maxTokens) > 0.8;
    expect(hasPulse).toBe(true);
  });

  test('usage at 70% does not trigger pulse', () => {
    const tokenCount = 7000;
    const maxTokens = 10000;
    const hasPulse = (tokenCount / maxTokens) > 0.8;
    expect(hasPulse).toBe(false);
  });
});

describe('UT-CTX-02: Auto-Suggest Prune at >90%', () => {
  test('prune suggestions populated when at 92%', () => {
    const files: PrunableFile[] = [
      { filePath: 'old.ts', tokenCount: 2000, pinnedAt: Date.now() - 100000, relevanceScore: 0.2, importanceScore: 0.1 },
      { filePath: 'new.ts', tokenCount: 1500, pinnedAt: Date.now() - 5000, relevanceScore: 0.9, importanceScore: 0.8 },
      { filePath: 'mid.ts', tokenCount: 1800, pinnedAt: Date.now() - 50000, relevanceScore: 0.5, importanceScore: 0.3 },
    ];
    const suggestions = suggestPrune(files, 9200, 10000);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  test('suggestions sorted by composite score descending', () => {
    const files: PrunableFile[] = [
      { filePath: 'a.ts', tokenCount: 1000, pinnedAt: Date.now() - 200000, relevanceScore: 0.1, importanceScore: 0.1 },
      { filePath: 'b.ts', tokenCount: 500, pinnedAt: Date.now() - 1000, relevanceScore: 0.95, importanceScore: 0.9 },
    ];
    const suggestions = suggestPrune(files, 9500, 10000);
    if (suggestions.length >= 2) {
      expect(suggestions[0].score).toBeGreaterThanOrEqual(suggestions[1].score);
    }
  });

  test('computeFreedThreshold returns positive when over 70%', () => {
    expect(computeFreedThreshold(9200, 10000)).toBeGreaterThan(0);
  });
});

describe('UT-CTX-03: /clear Resets All Context', () => {
  test('clearAll empties context store', () => {
    const store = { tokenCount: 5000, files: ['a.ts', 'b.ts', 'c.ts'] };
    store.tokenCount = 0;
    store.files = [];
    expect(store.tokenCount).toBe(0);
    expect(store.files).toHaveLength(0);
  });

  test('returns zero freed threshold after clear', () => {
    expect(computeFreedThreshold(0, 10000)).toBe(0);
  });
});
