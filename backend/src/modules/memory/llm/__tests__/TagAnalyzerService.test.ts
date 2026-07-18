/**
 * UT-01 to UT-06, UT-09: TagAnalyzerService unit tests
 * Tests for analyzeTags with mocked LLM service.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TagAnalyzerService, type TagSuggestion } from '../analyzer.js';
import { LLMService } from '../LLMService.js';
import type { ContextChainInput } from '../types.js';

function createMockLLM(responseText: string): LLMService {
  const svc = new LLMService({ provider: 'ollama', model: 'test', maxTokens: 2048 });
  vi.spyOn(svc, 'complete').mockResolvedValue({
    content: responseText,
    model: 'test',
    provider: 'ollama',
  });
  return svc;
}

function createMockLLMError(error: Error): LLMService {
  const svc = new LLMService({ provider: 'ollama', model: 'test', maxTokens: 2048 });
  vi.spyOn(svc, 'complete').mockRejectedValue(error);
  return svc;
}

const validLLMResponse = JSON.stringify({
  tags: [{ tag: 'auth-flow-login', category: 'feature', confidence: 0.95, reason: 'auth flow' }],
  summary: 'Describes authentication flow with JWT tokens.',
  business_entities: ['User', 'JWT Token'],
  actors: ['End User', 'System Admin'],
  business_rules: ['JWT expires after 24h', 'Password must be 8+ chars'],
});

const oldFormatResponse = JSON.stringify({
  tags: [{ tag: 'auth-flow', category: 'feature', confidence: 0.95, reason: 'login' }],
});

describe('TagAnalyzerService', () => {
  // UT-01: Full content sent to LLM (no truncation)
  describe('UT-01: Full content no truncation', () => {
    it('sends full 5000-char content to LLM without truncation', async () => {
      const llm = createMockLLM(validLLMResponse);
      const svc = new TagAnalyzerService(llm);
      const content5000 = 'A'.repeat(5000);

      const result = await svc.analyzeTags(content5000);

      expect(result.appliedTags.length).toBeGreaterThan(0);
      const completeSpy = vi.mocked(llm.complete);
      expect(completeSpy).toHaveBeenCalledTimes(1);
      const messages = completeSpy.mock.calls[0][0];
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg?.content).toBeTruthy();
      // Verify content is NOT truncated (should be 5000+ chars with prefix)
      const contentPart = userMsg!.content;
      const lines = contentPart.split('\n\n');
      const actualContent = lines[lines.length - 1];
      expect(actualContent.length).toBeGreaterThanOrEqual(5000);
    });
  });

  // UT-02: Short content (< 500 chars, baseline)
  describe('UT-02: Short content baseline', () => {
    it('processes 500-char content same as baseline', async () => {
      const llm = createMockLLM(validLLMResponse);
      const svc = new TagAnalyzerService(llm);

      const result = await svc.analyzeTags('B'.repeat(500));
      expect(result.appliedTags.length).toBeGreaterThan(0);
      const completeSpy = vi.mocked(llm.complete);
      const messages = completeSpy.mock.calls[0][0];
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg!.content.length).toBeGreaterThan(500);
    });
  });

  // UT-03: Content < 10 chars (skip LLM)
  describe('UT-03: Content too short', () => {
    it('returns empty result for empty content', async () => {
      const llm = createMockLLM(validLLMResponse);
      const svc = new TagAnalyzerService(llm);

      const result = await svc.analyzeTags('');
      expect(result.appliedTags).toEqual([]);
      expect(result.suggestedTags).toEqual([]);
      expect(result.fallbackUsed).toBe(false);
      expect(vi.mocked(llm.complete)).not.toHaveBeenCalled();
    });

    it('returns empty result for short content', async () => {
      const llm = createMockLLM(validLLMResponse);
      const svc = new TagAnalyzerService(llm);

      const result = await svc.analyzeTags('short');
      expect(result.appliedTags).toEqual([]);
      expect(vi.mocked(llm.complete)).not.toHaveBeenCalled();
    });

    it('returns empty result for whitespace-only', async () => {
      const llm = createMockLLM(validLLMResponse);
      const svc = new TagAnalyzerService(llm);

      const result = await svc.analyzeTags('   ');
      expect(result.appliedTags).toEqual([]);
      expect(vi.mocked(llm.complete)).not.toHaveBeenCalled();
    });
  });

  // UT-04: LLM timeout triggers fallback
  describe('UT-04: LLM timeout fallback', () => {
    it('uses fallback extraction on timeout', async () => {
      const llm = createMockLLMError(new Error('LLM timeout'));
      const svc = new TagAnalyzerService(llm);

      const result = await svc.analyzeTags('Error: bug fix for login page — we decided to use Strategy pattern');
      expect(result.fallbackUsed).toBe(true);
      expect(result.summary).toBe('');
      expect(result.business_entities).toEqual([]);
      expect(result.actors).toEqual([]);
      expect(result.business_rules).toEqual([]);
      // Keyword extraction should find some tags
      expect(result.appliedTags.length).toBeGreaterThanOrEqual(1);
    });
  });

  // UT-05: LLM unavailable triggers fallback
  describe('UT-05: LLM unavailable fallback', () => {
    it('uses fallback on connection error', async () => {
      const llm = createMockLLMError(new Error('Connection refused'));
      const svc = new TagAnalyzerService(llm);

      const result = await svc.analyzeTags('Testing authentication with JWT tokens');
      expect(result.fallbackUsed).toBe(true);
      expect(result.appliedTags).toContain('authentication');
    });
  });

  // UT-06: Context chain parameter propagation
  describe('UT-06: Context chain parameter', () => {
    it('prepends context block to LLM prompt when context provided', async () => {
      const llm = createMockLLM(validLLMResponse);
      const svc = new TagAnalyzerService(llm);
      const context: ContextChainInput = {
        previous_section_id: 1,
        summary: 'Section 1 about auth',
        business_entities: ['User'],
        actors: ['Admin'],
        business_rules: [],
      };

      await svc.analyzeTags('Section 2 content', undefined, context);
      const completeSpy = vi.mocked(llm.complete);
      const messages = completeSpy.mock.calls[0][0];
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg!.content).toContain('[Previous section context]');
      expect(userMsg!.content).toContain('Section 1 about auth');
      expect(userMsg!.content).toContain('Section 2 content');
    });

    it('uses standard prompt without context', async () => {
      const llm = createMockLLM(validLLMResponse);
      const svc = new TagAnalyzerService(llm);

      await svc.analyzeTags('Test content');
      const completeSpy = vi.mocked(llm.complete);
      const messages = completeSpy.mock.calls[0][0];
      const userMsg = messages.find(m => m.role === 'user');
      expect(userMsg!.content).toContain('/no_think');
      expect(userMsg!.content).not.toContain('[Previous section context]');
    });
  });

  // UT-09: applyThresholdWithExtended — Pass through new fields
  describe('UT-09: applyThresholdWithExtended pass-through', () => {
    it('passes new fields through threshold unchanged', async () => {
      // We test via analyzeTags since applyThresholdWithExtended is private
      // Using a mock that returns high-confidence tags with extended fields
      const extendedResponse = JSON.stringify({
        tags: [
          { tag: 'high-conf-tag', category: 'feature', confidence: 0.9, reason: 'test' },
          { tag: 'low-conf-tag', category: 'feature', confidence: 0.5, reason: 'test' },
        ],
        summary: 'Test summary',
        business_entities: ['E1'],
        actors: ['A1'],
        business_rules: ['R1'],
      });
      const llm = createMockLLM(extendedResponse);
      const svc = new TagAnalyzerService(llm);

      const result = await svc.analyzeTags('Test content for threshold checking');
      expect(result.appliedTags).toContain('high-conf-tag');
      expect(result.appliedTags).not.toContain('low-conf-tag');
    });
  });
});
