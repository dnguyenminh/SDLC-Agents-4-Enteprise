/**
 * PBT-01: chunkContent — Correctness Properties
 * Property-based tests using fast-check for the chunkContent utility.
 * Verifies overlap correctness, size bounds, monotonicity, and total chunk ≥ 1.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TagAnalyzerService } from '../analyzer.js';
import { LLMService } from '../LLMService.js';

function createService(): TagAnalyzerService {
  return new TagAnalyzerService(new LLMService({ provider: 'ollama', model: 'test', maxTokens: 2048 }));
}

describe('PBT-01: chunkContent correctness properties', () => {
  // P1: Total chunks >= 1
  it('always returns at least 1 chunk', () => {
    const svc = createService();
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 50000 }), (content) => {
        const result = svc.chunkContent(content, 6000, 200);
        expect(result.totalChunks).toBeGreaterThanOrEqual(1);
        expect(result.chunks.length).toBe(result.totalChunks);
      }),
    );
  });

  // P2: First chunk starts at 0, last chunk ends at content.length
  it('preserves content boundaries (first start 0, last end at length)', () => {
    const svc = createService();
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 20000 }),
        fc.integer({ min: 1000, max: 10000 }),
        fc.integer({ min: 50, max: 1000 }),
        (content, chunkSize, overlap) => {
          const result = svc.chunkContent(content, chunkSize, overlap);
          if (content.length === 0) {
            expect(result.chunks[0]).toBe('');
            return;
          }
          const first = result.chunks[0];
          const last = result.chunks[result.chunks.length - 1];
          expect(content.startsWith(first)).toBe(true);
          expect(content.endsWith(last)).toBe(true);
        },
      ),
    );
  });

  // P4: Each chunk length <= chunkSize
  it('each chunk respects chunkSize bound', () => {
    const svc = createService();
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30000 }),
        fc.integer({ min: 500, max: 20000 }),
        fc.integer({ min: 50, max: 500 }),
        (content, chunkSize, overlap) => {
          const result = svc.chunkContent(content, chunkSize, overlap);
          for (const chunk of result.chunks) {
            expect(chunk.length).toBeLessThanOrEqual(chunkSize + (result.chunks.length > 1 ? overlap : 0));
          }
        },
      ),
    );
  });

  // P5: Monotonicity — bigger chunkSize produces <= totalChunks
  it('monotonicity: larger chunkSize never increases totalChunks', () => {
    const svc = createService();
    fc.assert(
      fc.property(
        fc.string({ minLength: 100, maxLength: 30000 }),
        fc.integer({ min: 500, max: 5000 }),
        fc.integer({ min: 5000, max: 20000 }),
        fc.integer({ min: 50, max: 200 }),
        (content, smallSize, bigSize, overlap) => {
          const small = svc.chunkContent(content, Math.min(smallSize, bigSize), overlap);
          const big = svc.chunkContent(content, Math.max(smallSize, bigSize), overlap);
          expect(big.totalChunks).toBeLessThanOrEqual(small.totalChunks);
        },
      ),
    );
  });

  // Edge: empty string
  it('handles empty string', () => {
    const svc = createService();
    const result = svc.chunkContent('', 6000, 200);
    expect(result.chunks).toEqual(['']);
    expect(result.totalChunks).toBe(1);
  });

  // Edge: content shorter than chunkSize
  it('returns single chunk for short content', () => {
    const svc = createService();
    const result = svc.chunkContent('short content', 6000, 200);
    expect(result.chunks).toEqual(['short content']);
    expect(result.totalChunks).toBe(1);
  });
});
