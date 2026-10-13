/**
 * SA4E-360 — signature normalization property (STC PBT-08).
 * Fixture data: signature-normalization-testdata.csv SIG-01..SIG-06,
 * pre-seeded-index-fixtures.csv FIX-01 (>120-char class signature).
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sanitizeSignatureLine } from '../skeleton-renderer.js';

const SIG_01 = [
  'class SymbolOutlineExtractor implements',
  '\tOutlineExtractor<string, SearchCandidate[], RenderOptions, SkeletonRenderResult, Diagnostics>',
].join('\n');

// STC PBT-08 — ≤ 120 chars, whitespace collapsed, first-117 + '...' above 120
describe('PBT-08: signature normalization invariant', () => {
  it('keeps every rendered signature ≤ 120 chars with collapsed whitespace', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom('class ', 'method ', 'function ', 'x', ' ', '\t', '\n', '(a, b)', ': string'), {
            minLength: 0,
            maxLength: 60,
          })
          .map((chunks) => chunks.join('')),
        (raw) => {
          const out = sanitizeSignatureLine(raw);
          expect(out.length).toBeLessThanOrEqual(120);
          expect(out).not.toMatch(/[\t\n]/);
          expect(out).not.toMatch(/  /);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('trims >120-char signatures to first 117 chars + "..." exactly (SIG-01, FIX-01)', () => {
    const out = sanitizeSignatureLine(SIG_01);
    expect(out.length).toBe(120);
    expect(out.endsWith('...')).toBe(true);
    expect(out).toBe(`${out.slice(0, 117)}...`);
  });

  it('leaves ≤120-char signatures unchanged apart from whitespace collapse (SIG-04)', () => {
    const out = sanitizeSignatureLine('export\t\tfunction\n\n\nlocateSymbol(query: string): Promise<LocateResult>');
    expect(out).toBe('export function locateSymbol(query: string): Promise<LocateResult>');
    expect(out.length).toBeLessThanOrEqual(120);
  });

  it('collapses whitespace-only signatures to a single space (SIG-05)', () => {
    expect(sanitizeSignatureLine('\t\t\n\n')).toBe(' ');
  });
});
