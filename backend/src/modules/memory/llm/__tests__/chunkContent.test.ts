/**
 * UT-10: chunkContent — Correct splitting with overlap
 * Deterministic unit tests for the chunkContent utility.
 */
import { describe, it, expect } from 'vitest';
import { TagAnalyzerService } from '../analyzer.js';
import { LLMService } from '../LLMService.js';

function createService(): TagAnalyzerService {
  return new TagAnalyzerService(new LLMService({ provider: 'ollama', model: 'test', maxTokens: 2048 }));
}

describe('UT-10: chunkContent', () => {
  it('returns 1 chunk for content under chunkSize', () => {
    const svc = createService();
    const result = svc.chunkContent('A'.repeat(5000), 6000, 200);
    expect(result.chunks.length).toBe(1);
    expect(result.totalChunks).toBe(1);
    expect(result.chunks[0]).toBe('A'.repeat(5000));
  });

  it('splits 15000-char content into 3 chunks with correct boundaries', () => {
    const svc = createService();
    const content = buildSequentialContent(15000);
    const result = svc.chunkContent(content, 6000, 200);
    expect(result.totalChunks).toBe(3);
    // Chunk 1: chars 0-6000
    expect(result.chunks[0]).toBe(content.slice(0, 6000));
    // Chunk 2: chars 5800-11800
    expect(result.chunks[1]).toBe(content.slice(5800, 11800));
    // Chunk 3: chars 11600-15000
    expect(result.chunks[2]).toBe(content.slice(11600, 15000));
  });

  it('handles 6100-char content with 2 chunks', () => {
    const svc = createService();
    const content = buildSequentialContent(6100);
    const result = svc.chunkContent(content, 6000, 200);
    expect(result.totalChunks).toBe(2);
    expect(result.chunks[0]).toBe(content.slice(0, 6000));
    expect(result.chunks[1]).toBe(content.slice(5800, 6100));
  });

  it('handles empty string', () => {
    const svc = createService();
    const result = svc.chunkContent('', 6000, 200);
    expect(result.chunks).toEqual(['']);
    expect(result.totalChunks).toBe(1);
  });

  it('preserves full content when chunks are overlapped correctly', () => {
    const svc = createService();
    const content = buildSequentialContent(10000);
    const result = svc.chunkContent(content, 6000, 200);
    // Each chunk's start should respect overlap
    expect(result.chunks[0]).toBe(content.slice(0, 6000));
    expect(result.chunks[1]).toBe(content.slice(5800, 10000));
    // Full content should be covered from start to end
    expect(result.chunks[0][0]).toBe(content[0]);
    const lastChunk = result.chunks[result.chunks.length - 1];
    expect(lastChunk[lastChunk.length - 1]).toBe(content[content.length - 1]);
  });

  it('handles overlap >= chunkSize gracefully', () => {
    const svc = createService();
    const content = buildSequentialContent(10000);
    // overlap > chunkSize should not cause infinite loop
    const result = svc.chunkContent(content, 5000, 6000);
    expect(result.totalChunks).toBeGreaterThanOrEqual(1);
    expect(result.totalChunks).toBeLessThanOrEqual(10);
  });
});

/** Build sequential content where each char is its index mod 26 as a letter. */
function buildSequentialContent(length: number): string {
  return Array.from({ length }, (_, i) => String.fromCharCode(97 + (i % 26))).join('');
}
