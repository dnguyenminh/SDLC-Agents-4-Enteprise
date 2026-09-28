import { describe, it, expect } from 'vitest';
import { FsContentReader, SymbolOutlineExtractor } from '../symbol-outline-extractor';
import { TokenCounter } from '../token-counter';
import type { SearchCandidate } from '../types';

const counter = new TokenCounter();

function symbol(index: number): SearchCandidate {
  return {
    name: `handlerFunction${index}`,
    filePath: 'src/handlers.ts',
    kind: 'function',
    signature: `(payload${index}: SomePayloadType, options${index}: OptionsBag): Promise<Record<string, unknown>>`,
    source: 'code_search',
  };
}

describe('SymbolOutlineExtractor', () => {
  const extractor = new SymbolOutlineExtractor(counter, new FsContentReader());

  it('extracts outline with kind, name and signature', () => {
    const outline = extractor.extractOutline('src/handlers.ts', [symbol(1)], 200);
    expect(outline).toContain('// handlers.ts');
    expect(outline).toContain('function handlerFunction1');
    expect(outline).toContain('SomePayloadType');
  });

  it('caps the outline at the symbol-tier token budget (200)', () => {
    const outline = extractor.extractOutline('src/handlers.ts', Array.from({ length: 200 }, (_, i) => symbol(i)), 200);
    expect(counter.estimate(outline)).toBeLessThanOrEqual(200);
    expect(outline).toContain('handlerFunction1');
  });

  it('drops the last symbol that would exceed the budget', () => {
    const outline = extractor.extractOutline('src/handlers.ts', [symbol(1), symbol(2)], 25);
    expect(counter.estimate(outline)).toBeLessThanOrEqual(25);
  });

  it('extractChunk returns at most maxLines lines', () => {
    const reader = {
      readHead: (_filePath: string, maxLines: number) =>
        Array.from({ length: maxLines }, (_, i) => `line ${i}`).join('\n'),
    };
    const chunking = new SymbolOutlineExtractor(counter, reader);
    const chunk = chunking.extractChunk('src/big.ts', 80, 800);
    expect(chunk.split('\n')).toHaveLength(80);
  });

  it('extractChunk trims to the chunk-tier token budget (800)', () => {
    const longLine = 'x'.repeat(500);
    const reader = {
      readHead: (_filePath: string, maxLines: number) =>
        Array.from({ length: maxLines }, () => longLine).join('\n'),
    };
    const chunking = new SymbolOutlineExtractor(counter, reader);
    const chunk = chunking.extractChunk('src/big.ts', 80, 800);
    expect(counter.estimate(chunk)).toBeLessThanOrEqual(800);
  });

  it('returns empty chunk for unreadable files', () => {
    expect(extractor.extractChunk('no-such-file.ts', 80, 800)).toBe('');
  });
});

describe('FsContentReader', () => {
  it('returns empty string for missing file', () => {
    expect(new FsContentReader().readHead('no-such-file.ts', 10)).toBe('');
  });
});
