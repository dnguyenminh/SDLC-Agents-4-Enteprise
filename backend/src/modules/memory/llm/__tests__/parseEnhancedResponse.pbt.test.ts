/**
 * PBT-03: parseEnhancedResponse — Robustness Properties
 * Property-based tests for enhanced LLM response parsing with random inputs.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TagAnalyzerService } from '../analyzer.js';
import { LLMService } from '../LLMService.js';

function createService(): TagAnalyzerService {
  return new TagAnalyzerService(new LLMService({ provider: 'ollama', model: 'test', maxTokens: 2048 }));
}

describe('PBT-03: parseEnhancedResponse robustness properties', () => {
  // P1: Never throws
  it('never throws for any string input', () => {
    const svc = createService();
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 1000 }), (input) => {
        expect(() => svc.parseEnhancedResponse(input)).not.toThrow();
      }),
    );
  });

  // P2: Always returns valid structure
  it('always returns valid structure with all required fields', () => {
    const svc = createService();
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 500 }), (input) => {
        const result = svc.parseEnhancedResponse(input);
        expect(Array.isArray(result.suggestions)).toBe(true);
        expect(typeof result.summary).toBe('string');
        expect(Array.isArray(result.business_entities)).toBe(true);
        expect(Array.isArray(result.actors)).toBe(true);
        expect(Array.isArray(result.business_rules)).toBe(true);
      }),
    );
  });

  // P3: Tag bounds
  it('enforces tag length bounds', () => {
    const svc = createService();
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('{"tags":[{"tag":"valid-tag-name","category":"feature","confidence":0.9,"reason":"test"}]}'),
          fc.constant('{"tags":[{"tag":"ab","category":"feature","confidence":0.9,"reason":"too-short"}]}'),
          fc.constant('{"tags":[{"tag":"a'.repeat(30) + '","category":"feature","confidence":0.9,"reason":"too-long"}]}'),
        ),
        (input) => {
          const result = svc.parseEnhancedResponse(input);
          for (const s of result.suggestions) {
            expect(s.tag.length).toBeGreaterThanOrEqual(3);
            expect(s.tag.length).toBeLessThanOrEqual(50);
          }
        },
      ),
    );
  });

  // P7: Summary bound
  it('enforces summary max 500 chars', () => {
    const svc = createService();
    const longSummary = 'x'.repeat(1000);
    const input = `{"tags":[],"summary":"${longSummary}"}`;
    const result = svc.parseEnhancedResponse(input);
    expect(result.summary.length).toBeLessThanOrEqual(500);
  });

  // P8: Old format compatibility (tags only)
  it('handles old format (tags only) without crash', () => {
    const svc = createService();
    const input = '{"tags":[{"tag":"auth-flow","category":"feature","confidence":0.95,"reason":"login"}]}';
    const result = svc.parseEnhancedResponse(input);
    expect(result.suggestions.length).toBe(1);
    expect(result.suggestions[0].tag).toBe('auth-flow');
    expect(result.summary).toBe('');
    expect(result.business_entities).toEqual([]);
    expect(result.actors).toEqual([]);
    expect(result.business_rules).toEqual([]);
  });

  // Edge: empty/null/undefined
  it('handles empty input gracefully', () => {
    const svc = createService();
    expect(svc.parseEnhancedResponse('').suggestions).toEqual([]);
    expect(svc.parseEnhancedResponse('   ').suggestions).toEqual([]);
  });
});
