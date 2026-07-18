/**
 * IT-08: TagAnalyzerService Integration Test — Chunking
 * Tests for automatic chunking when content exceeds context window.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TagAnalyzerService } from '../analyzer.js';
import { LLMService } from '../LLMService.js';
import type { TaskWorkerConfig } from '../../task-queue/TaskWorkerConfig.js';

const chunkConfig: Partial<TaskWorkerConfig> = {
  llmChunkSize: 6000,
  llmChunkOverlap: 200,
};

describe('IT-08: Chunking integration', () => {
  let llm: LLMService;
  let svc: TagAnalyzerService;

  beforeEach(() => {
    llm = new LLMService({ provider: 'ollama', model: 'test', maxTokens: 2048 });
    svc = new TagAnalyzerService(llm, undefined, chunkConfig as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('activates chunking for content exceeding context window', async () => {
    const spy = vi.spyOn(llm, 'complete')
      .mockResolvedValueOnce({
        content: JSON.stringify({ tags: [{ tag: 'chunk-one-tag', category: 'feature', confidence: 0.9, reason: 'first' }], summary: 'First chunk summary', business_entities: ['E1'], actors: ['A1'], business_rules: ['R1'] }),
        model: 'test', provider: 'ollama',
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ tags: [{ tag: 'chunk-two-tag', category: 'feature', confidence: 0.9, reason: 'second' }], summary: 'Second chunk summary', business_entities: ['E2'], actors: ['A2'], business_rules: ['R2'] }),
        model: 'test', provider: 'ollama',
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ tags: [{ tag: 'chunk-three-tag', category: 'feature', confidence: 0.9, reason: 'third' }], summary: 'Third chunk summary', business_entities: ['E3'], actors: ['A3'], business_rules: ['R3'] }),
        model: 'test', provider: 'ollama',
      });

    // 15000 chars will trigger chunking (chunkSize=6000)
    const content = 'X'.repeat(15000);
    const result = await svc.analyzeTags(content);

    // LLM should have been called 3 times (3 chunks)
    expect(spy).toHaveBeenCalledTimes(3);

    // Tags from all chunks should be present (merged)
    expect(result.appliedTags).toContain('chunk-one-tag');
    expect(result.appliedTags).toContain('chunk-two-tag');
    expect(result.appliedTags).toContain('chunk-three-tag');

    // Summary from first chunk only
    expect(result.summary).toBe('First chunk summary');

    // Entities from all chunks (union, deduplicated)
    expect(result.business_entities.length).toBeGreaterThanOrEqual(3);
  });

  it('does not chunk content within context window', async () => {
    const spy = vi.spyOn(llm, 'complete').mockResolvedValueOnce({
      content: JSON.stringify({ tags: [{ tag: 'single-tag', category: 'feature', confidence: 0.9, reason: 'single' }] }),
      model: 'test', provider: 'ollama',
    });

    // 3000 chars is well within context window (estimatedTokens=1000 < maxTokens=2048)
    const result = await svc.analyzeTags('Y'.repeat(3000));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.appliedTags).toContain('single-tag');
  });

  it('handles empty content gracefully (no LLM call)', async () => {
    const spy = vi.spyOn(llm, 'complete');
    const result = await svc.analyzeTags('');
    expect(spy).not.toHaveBeenCalled();
    expect(result.appliedTags).toEqual([]);
    expect(result.fallbackUsed).toBe(false);
  });
});
