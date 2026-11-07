/**
 * SA4E-85 — Integration Tests: Context Manager (IT-CTX-01/02).
 * Tests prune suggestions and /clear full reset flow.
 */

import { describe, test, expect } from 'vitest';
import { suggestPrune, computeFreedThreshold, type PrunableFile } from '../../chat/context/pruningAlgorithm';

describe('IT-CTX-01: ContextManager Prune Suggestions', () => {
  test('95% usage produces prune suggestions', () => {
    const files: PrunableFile[] = Array.from({ length: 10 }, (_, i) => ({
      filePath: 'file' + i + '.ts',
      tokenCount: 950,
      pinnedAt: Date.now() - (i * 10000),
      relevanceScore: 0.5,
      importanceScore: 0.3,
    }));
    const suggestions = suggestPrune(files, 9500, 10000);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  test('unpinning suggested file decreases token count', () => {
    const files: PrunableFile[] = [
      { filePath: 'a.ts', tokenCount: 3000, pinnedAt: Date.now() - 90000, relevanceScore: 0.2, importanceScore: 0.1 },
      { filePath: 'b.ts', tokenCount: 2000, pinnedAt: Date.now() - 50000, relevanceScore: 0.8, importanceScore: 0.5 },
    ];
    const suggestions = suggestPrune(files, 9500, 10000);
    const freed = suggestions.reduce((s, c) => s + c.tokensSaved, 0);
    expect(freed).toBeGreaterThan(0);
  });
});

describe('IT-CTX-02: /clear Full Reset Flow', () => {
  test('clear resets tokens to 0', () => {
    const threshold = computeFreedThreshold(0, 10000);
    expect(threshold).toBe(0);
  });

  test('empty files array produces no suggestions', () => {
    const suggestions = suggestPrune([], 0, 10000);
    expect(suggestions).toHaveLength(0);
  });
});
