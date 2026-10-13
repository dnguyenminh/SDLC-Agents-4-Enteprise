/**
 * SA4E-360 — property-based tests for the skeleton truncator (STC PBT-04..07)
 * and the global incremental budget render (STC PBT-10 / SEC-360-02).
 * Fixture data: truncation-scenarios-testdata.csv TRC-06..TRC-12.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { estimateTokenCount } from '../../../pi-agent/prompt-compressor.js';
import { TokenCounter } from '../../../pi-agent/context-retrieval/token-counter.js';
import { SymbolOutlineExtractor } from '../../../pi-agent/context-retrieval/symbol-outline-extractor.js';
import { SkeletonTruncator } from '../skeleton-truncator.js';
import { renderCorpusWithGlobalBudget, type CorpusFile } from '../skeleton-renderer.js';
import type { SkeletonPart, SearchCandidate } from '../skeleton-types.js';

const MODULE_POOL = ['engine', 'extension', 'backend', 'shared', 'tools'];

/** fc-derived part with a content sized to an exact chars/4 token count. */
const fcPart: fc.Arbitrary<SkeletonPart> = fc
  .record({
    module: fc.constantFrom(...MODULE_POOL),
    tokens: fc.integer({ min: 1, max: 30_000 }),
    header: fc.boolean(),
  })
  .map(({ module, tokens, header }) => ({
    filePath: `${module}/part-${tokens}-${header ? 'h' : 'f'}.ts`,
    module,
    kind: header ? ('module-header' as const) : ('file' as const),
    content: 'x'.repeat(Math.max(1, tokens * 4 - 1)),
  }));

/** Truncates with a fresh onDrop spy so per-iteration totals are observable. */
function runTruncation(parts: SkeletonPart[], cap: number, priority: string[], maxDrops?: number) {
  const totalsAfter: number[] = [];
  const truncator = new SkeletonTruncator({ onDrop: (_p, total) => totalsAfter.push(total) });
  const res = truncator.truncate(parts, cap, priority, Math.ceil(cap / 0.7), { maxDrops });
  return { res, totalsAfter };
}

// STC PBT-04 — strict-shrink invariant (TRC-06)
describe('PBT-04: truncation strict-shrink property', () => {
  it('drops exactly one part per iteration; running total never increases', () => {
    fc.assert(
      fc.property(
        fc.array(fcPart, { minLength: 1, maxLength: 200 }),
        fc.integer({ min: 1, max: 20_000 }),
        fc.shuffledSubarray([...MODULE_POOL], { minLength: MODULE_POOL.length, maxLength: MODULE_POOL.length }),
        (parts, cap, priority) => {
          const { totalsAfter } = runTruncation(parts, cap, priority);
          // Exactly one drop per iteration ⇒ totals strictly shrink, ≤ parts.length iterations.
          for (let i = 1; i < totalsAfter.length; i++) {
            expect(totalsAfter[i]).toBeLessThan(totalsAfter[i - 1]);
          }
          expect(totalsAfter.length).toBeLessThanOrEqual(parts.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// STC PBT-05 — termination (TRC-07)
describe('PBT-05: truncation loop termination', () => {
  it('terminates within ≤ parts.length iterations for arbitrary inputs', () => {
    fc.assert(
      fc.property(
        fc.array(fcPart, { minLength: 0, maxLength: 300 }),
        fc.integer({ min: 1, max: 15_000 }),
        fc.constant(['engine', 'extension', 'backend', 'shared', 'tools']),
        (parts, cap, priority) => {
          const { totalsAfter } = runTruncation(parts, cap, priority);
          expect(totalsAfter.length).toBeLessThanOrEqual(Math.max(parts.length, 1));
        }
      ),
      { numRuns: 100 }
    );
  });
});

// STC PBT-06 — post-condition: (tokens ≤ cap) XOR REJECT (TRC-08)
describe('PBT-06: post-truncation budget post-condition', () => {
  it('tokens ≤ cap XOR gateDecision REJECT holds for every run', () => {
    fc.assert(
      fc.property(
        fc.array(fcPart, { minLength: 0, maxLength: 150 }),
        fc.integer({ min: 100, max: 20_000 }),
        (parts, cap) => {
          const { res } = runTruncation(parts, cap, [...MODULE_POOL]);
          if (res.gateDecision === 'REJECT') {
            expect(res.skeletonTokens).toBeGreaterThan(cap);
          } else {
            expect(res.skeletonTokens).toBeLessThanOrEqual(cap);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// STC PBT-07 — usagePercent ≤ 0.70 invariant when not REJECT (M6, TRC-09)
describe('PBT-07: usagePercent ≤ 0.70 invariant (M6)', () => {
  it('skeletonTokens / staticBudget ≤ 0.70 for PASS/TRUNCATED_PASS outcomes', () => {
    fc.assert(
      fc.property(
        fc.array(fcPart, { minLength: 0, maxLength: 120 }),
        fc.integer({ min: 1_000, max: 60_000 }),
        (parts, staticBudget) => {
          const cap = Math.floor(0.7 * staticBudget);
          const { res } = runTruncation(parts, cap, [...MODULE_POOL]);
          if (res.gateDecision !== 'REJECT') {
            expect(res.skeletonTokens / staticBudget).toBeLessThanOrEqual(0.70 + 1e-9);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/** Builds the real production renderer deps (extractor + shipped estimator). */
function productionDeps() {
  const extractor = new SymbolOutlineExtractor(new TokenCounter(), { readHead: () => '' });
  let measureCalls = 0;
  return {
    deps: {
      renderFile: (filePath: string, symbols: readonly SearchCandidate[], maxTokens: number) =>
        extractor.extractOutline(filePath, symbols as never, maxTokens),
      measure: (text: string) => {
        measureCalls++;
        return estimateTokenCount(text);
      },
    },
    callCount: () => measureCalls,
  };
}

// STC PBT-10 — global incremental budget bound + O(parts) accounting (SEC-360-02)
describe('PBT-10: global incremental budget + O(parts) accounting (SEC-360-02)', () => {
  it('measuredSoFar never exceeds cap at any file boundary; measure calls stay O(parts)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 300 }),
        fc.integer({ min: 500, max: 13_767 }),
        fc.integer({ min: 0, max: 40 }),
        (fileCount, cap, perFileSymbols) => {
          const files: CorpusFile[] = Array.from({ length: fileCount }, (_, i) => ({
            filePath: `src/f${i}.ts`,
            module: MODULE_POOL[i % MODULE_POOL.length],
            symbols: Array.from({ length: perFileSymbols }, (_, j) => ({
              name: `sym${i}_${j}`,
              kind: 'method',
              signature: `sym${i}_${j}(a, b)`,
              source: 'code_search' as const,
            })),
          }));
          const { deps, callCount } = productionDeps();
          const res = renderCorpusWithGlobalBudget(files, cap, deps);
          // Every measured file boundary stayed within the remaining-global budget.
          for (const part of res.parts) {
            expect(res.boundaryTokens.get(part.filePath) ?? 0).toBeLessThanOrEqual(cap);
          }
          expect(estimateTokenCount(res.content)).toBeLessThanOrEqual(cap + Math.ceil(res.parts.length / 4));
          // O(parts): one measure per rendered file + at most one final join measure.
          expect(callCount()).toBeLessThanOrEqual(2 * fileCount + 1);
        }
      ),
      { numRuns: 40 }
    );
  });

  it('completes 150 RAW_HEAD-class parts well under 1s in-process (TRC-12 wall-clock guard)', () => {
    const files: CorpusFile[] = Array.from({ length: 150 }, (_, i) => ({
      filePath: `src/raw${i}.ts`,
      module: 'extension',
      symbols: Array.from({ length: 50 }, (_, j) => ({
        name: `raw${i}_sym${j}`,
        kind: 'function',
        signature: `raw${i}_sym${j}(x: string): string`,
        source: 'code_search' as const,
      })),
    }));
    const { deps } = productionDeps();
    const started = Date.now();
    const res = renderCorpusWithGlobalBudget(files, 13_767, deps);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(estimateTokenCount(res.content)).toBeLessThanOrEqual(13_767 + Math.ceil(res.parts.length / 4));
  });
});
