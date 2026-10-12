import { describe, it, expect } from 'vitest';
import { chunkPrompt, shouldAutoChunk, synthesizeChunks, estimateTokens, DEFAULT_AUTO_CHUNK_CONFIG } from '../context-budget-auto-split';

describe('context-budget-auto-split', () => {
  it('estimateTokens approximates chars/4', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('chunkPrompt splits by paragraphs respecting max tokens', () => {
    const text = Array.from({ length: 10 }, (_, i) => `Paragraph ${i} ${'x'.repeat(200)}`).join('\n\n');
    const chunks = chunkPrompt(text, 300);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(c => {
      expect(estimateTokens(c)).toBeLessThanOrEqual(300 + 200); // allow boundary
    });
  });

  it('shouldAutoChunk returns true for small tier and large prompt', () => {
    expect(shouldAutoChunk('small', 5000, DEFAULT_AUTO_CHUNK_CONFIG)).toBe(true);
  });

  it('shouldAutoChunk returns false for medium tier', () => {
    expect(shouldAutoChunk('medium', 5000, DEFAULT_AUTO_CHUNK_CONFIG)).toBe(false);
  });

  it('synthesizeChunks concatenates results', () => {
    const out = synthesizeChunks(['a', 'b', 'c']);
    expect(out).toContain('a');
    expect(out).toContain('b');
    expect(out).toContain('---');
  });
});
