/**
 * UT-07, UT-08: parseEnhancedResponse unit tests
 * Tests for old format compatibility and invalid JSON fallback.
 */
import { describe, it, expect } from 'vitest';
import { TagAnalyzerService } from '../analyzer.js';
import { LLMService } from '../LLMService.js';

function createService(): TagAnalyzerService {
  return new TagAnalyzerService(new LLMService({ provider: 'ollama', model: 'test', maxTokens: 2048 }));
}

describe('parseEnhancedResponse', () => {
  // UT-07: Old format (tags only, no new fields)
  describe('UT-07: Old format compatibility', () => {
    it('extracts tags and fills defaults for missing new fields', () => {
      const svc = createService();
      const input = JSON.stringify({
        tags: [{ tag: 'auth-flow', category: 'feature', confidence: 0.95, reason: 'login' }],
      });
      const result = svc.parseEnhancedResponse(input);
      expect(result.suggestions.length).toBe(1);
      expect(result.suggestions[0].tag).toBe('auth-flow');
      expect(result.summary).toBe('');
      expect(result.business_entities).toEqual([]);
      expect(result.actors).toEqual([]);
      expect(result.business_rules).toEqual([]);
    });

    it('handles tags.suggestions field (old format variant)', () => {
      const svc = createService();
      const input = JSON.stringify({
        suggestions: [{ tag: 'legacy-tag', category: 'feature', confidence: 0.9, reason: 'test' }],
      });
      const result = svc.parseEnhancedResponse(input);
      expect(result.suggestions.length).toBe(1);
      expect(result.suggestions[0].tag).toBe('legacy-tag');
    });
  });

  // UT-08: Invalid JSON (regex fallback)
  describe('UT-08: Invalid JSON fallback', () => {
    it('uses regex fallback for unparseable responses', () => {
      const svc = createService();
      const result = svc.parseEnhancedResponse("I think the tags are 'auth-flow' and 'login-system'");
      expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
      expect(result.summary).toBe('');
      expect(result.business_entities).toEqual([]);
    });

    it('returns empty suggestions when no hyphenated tags found', () => {
      const svc = createService();
      const result = svc.parseEnhancedResponse('The content describes authentication flow');
      expect(result.suggestions).toEqual([]);
    });

    it('handles broken JSON gracefully', () => {
      const svc = createService();
      const result = svc.parseEnhancedResponse('{"broken json');
      // Should not throw, returns defaults
      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    it('filters out false-positive tag matches', () => {
      const svc = createService();
      const result = svc.parseEnhancedResponse("let-me wait-the so-maybe that-s");
      expect(result.suggestions).toEqual([]);
    });
  });

  // New format with all fields
  describe('New format parsing', () => {
    it('parses all fields from full response', () => {
      const svc = createService();
      const input = JSON.stringify({
        tags: [{ tag: 'user-auth-flow', category: 'feature', confidence: 0.95, reason: 'auth' }],
        summary: 'Describes user authentication with JWT.',
        business_entities: ['User', 'JWT Token', 'Database'],
        actors: ['End User', 'System Admin'],
        business_rules: ['Password must be 8+ characters'],
      });
      const result = svc.parseEnhancedResponse(input);
      expect(result.suggestions.length).toBe(1);
      expect(result.suggestions[0].tag).toBe('user-auth-flow');
      expect(result.summary).toBe('Describes user authentication with JWT.');
      expect(result.business_entities).toEqual(['User', 'JWT Token', 'Database']);
      expect(result.actors).toEqual(['End User', 'System Admin']);
      expect(result.business_rules).toEqual(['Password must be 8+ characters']);
    });

    it('enforces max limits on fields', () => {
      const svc = createService();
      const entities = Array.from({ length: 10 }, (_, i) => `Entity${i}`);
      const rules = Array.from({ length: 20 }, (_, i) => `Rule ${i}`);
      const input = JSON.stringify({
        tags: [],
        summary: '',
        business_entities: entities,
        actors: [],
        business_rules: rules,
      });
      const result = svc.parseEnhancedResponse(input);
      expect(result.business_entities.length).toBeLessThanOrEqual(5);
      expect(result.business_rules.length).toBeLessThanOrEqual(10);
    });

    it('enforces entity/actor/rule length limits', () => {
      const svc = createService();
      const input = JSON.stringify({
        tags: [],
        summary: '',
        business_entities: ['a'.repeat(200)],
        actors: ['b'.repeat(200)],
        business_rules: ['c'.repeat(500)],
      });
      const result = svc.parseEnhancedResponse(input);
      expect(result.business_entities).toEqual([]);
      expect(result.actors).toEqual([]);
      expect(result.business_rules).toEqual([]);
    });

    it('truncates summary to 500 chars', () => {
      const svc = createService();
      const longSummary = 'x'.repeat(1000);
      const input = JSON.stringify({ tags: [], summary: longSummary });
      const result = svc.parseEnhancedResponse(input);
      expect(result.summary.length).toBeLessThanOrEqual(500);
    });
  });
});
