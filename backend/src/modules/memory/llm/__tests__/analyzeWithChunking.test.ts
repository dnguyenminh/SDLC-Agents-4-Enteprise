/**
 * UT-11: analyzeWithChunking — Merge results from multiple chunks
 * Tests for chunking merge logic with mocked LLM per chunk.
 *
 * 10000-char content with chunkSize=6000 overlap=200 → 2 chunks:
 *   chunk1: [0..6000)
 *   chunk2: [5800..10000)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TagAnalyzerService } from '../analyzer.js';
import { LLMService } from '../LLMService.js';

describe('UT-11: analyzeWithChunking merge', () => {
  let svc: TagAnalyzerService;
  let llm: LLMService;
  let mockComplete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    llm = new LLMService({ provider: 'ollama', model: 'test', maxTokens: 2048 });
    // Directly replace the complete method with a mock function
    mockComplete = vi.fn();
    llm.complete = mockComplete as any;
    svc = new TagAnalyzerService(llm);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges tags from multiple chunks (union, deduplicated)', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ tags: [{ tag: 'chunk-a', category: 'feature', confidence: 0.9, reason: 'a' }, { tag: 'chunk-b', category: 'feature', confidence: 0.9, reason: 'b' }] }),
        model: 'test', provider: 'ollama',
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ tags: [{ tag: 'chunk-b', category: 'feature', confidence: 0.9, reason: 'b' }, { tag: 'chunk-c', category: 'feature', confidence: 0.9, reason: 'c' }] }),
        model: 'test', provider: 'ollama',
      });

    const result = await svc.analyzeWithChunking('A'.repeat(10000), null, 6000, 200);
    expect(result.appliedTags).toContain('chunk-a');
    expect(result.appliedTags).toContain('chunk-b');
    expect(result.appliedTags).toContain('chunk-c');
    expect(result.appliedTags.length).toBe(3);
  });

  it('takes summary from first chunk only', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ tags: [{ tag: 'tag1', category: 'feature', confidence: 0.9, reason: 'a' }], summary: 'First chunk summary' }),
        model: 'test', provider: 'ollama',
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ tags: [{ tag: 'tag2', category: 'feature', confidence: 0.9, reason: 'b' }], summary: 'Second chunk summary' }),
        model: 'test', provider: 'ollama',
      });

    const result = await svc.analyzeWithChunking('A'.repeat(10000), null, 6000, 200);
    expect(result.summary).toBe('First chunk summary');
  });

  it('unions business_entities and caps at 5', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ tags: [{ tag: 't1', category: 'feature', confidence: 0.9, reason: 'a' }], business_entities: ['E1', 'E2', 'E3', 'E4'] }),
        model: 'test', provider: 'ollama',
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ tags: [{ tag: 't2', category: 'feature', confidence: 0.9, reason: 'b' }], business_entities: ['E4', 'E5', 'E6'] }),
        model: 'test', provider: 'ollama',
      });

    const result = await svc.analyzeWithChunking('A'.repeat(10000), null, 6000, 200);
    expect(result.business_entities.length).toBeLessThanOrEqual(5);
    expect(result.business_entities).toContain('E1');
    expect(result.business_entities).toContain('E5');
  });

  it('sets fallbackUsed = true if ANY chunk used fallback', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ tags: [{ tag: 't1', category: 'feature', confidence: 0.9, reason: 'a' }] }),
        model: 'test', provider: 'ollama',
      })
      .mockRejectedValueOnce(new Error('Timeout'));

    const result = await svc.analyzeWithChunking('A'.repeat(10000), null, 6000, 200);
    expect(result.fallbackUsed).toBe(true);
  });
});
