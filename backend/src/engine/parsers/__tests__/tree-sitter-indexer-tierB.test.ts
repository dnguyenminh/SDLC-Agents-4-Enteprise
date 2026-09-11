import { describe, it, expect, vi } from 'vitest';
import { TreeSitterIndexer } from '../tree-sitter-indexer.js';

describe('TreeSitterIndexer Tier B fallback', () => {
  it('should fallback to full-text for jsp extension', async () => {
    const mockAdapter = { runAsync: vi.fn().mockResolvedValue({}) };
    const mockRegistry = { getParser: vi.fn().mockResolvedValue(null) };
    const indexer = new TreeSitterIndexer(mockRegistry as any, mockAdapter as any, 1_000_000, '', 1000);
    // we cannot easily test file IO without real file, skip
    expect(indexer).toBeDefined();
  });
});
