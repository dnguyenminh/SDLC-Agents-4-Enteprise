import { describe, it, expect } from 'vitest';
import { ProgressiveDisclosureManager } from '../progressive-disclosure';
import { FsContentReader, SymbolOutlineExtractor } from '../symbol-outline-extractor';
import { TokenCounter } from '../token-counter';
import { DEFAULT_RETRIEVAL_CONFIG } from '../types';
import type { RankedSymbol } from '../types';

const counter = new TokenCounter();
const extractor = new SymbolOutlineExtractor(counter, {
  readHead: () => 'const a = 1;\n'.repeat(80),
});
const config = { ...DEFAULT_RETRIEVAL_CONFIG };
const manager = new ProgressiveDisclosureManager({ counter, extractor, config });

const FAT_SIGNATURE =
  '(payload: ComplexPayloadType, options: OptionsBag, context: ExecutionContext): Promise<Record<string, unknown>>';

function ranked(filePath: string, rank: number, signature = ''): RankedSymbol {
  return {
    name: 'sym',
    filePath,
    kind: 'function',
    rank,
    score: 10 - rank,
    signature: signature || undefined,
    source: 'code_search',
  };
}

function candidates(count: number, signature = ''): RankedSymbol[] {
  return Array.from({ length: count }, (_, i) => ranked(`src/file${i}.ts`, i + 1, signature));
}

describe('ProgressiveDisclosureManager', () => {
  it('TC-002: applies three-tier disclosure within budget', () => {
    const plan = manager.disclose(candidates(20));
    expect(plan.totalTokens).toBeLessThanOrEqual(6000);
    expect(plan.contextFiles.length).toBeGreaterThan(0);
    expect(plan.contextFiles.length).toBeLessThanOrEqual(20);
  });

  it('TC-302: token budget <= 6000 is enforced (hard cap)', () => {
    const plan = manager.disclose(candidates(20, FAT_SIGNATURE));
    expect(plan.totalTokens).toBeLessThanOrEqual(6000);
  });

  it('TC-303: 1000-file repo stays under 6k tokens and keeps the top-ranked file', () => {
    const plan = manager.disclose(candidates(1000, FAT_SIGNATURE));
    expect(plan.totalTokens).toBeLessThanOrEqual(6000);
    expect(plan.contextFiles[0].path).toBe('src/file0.ts');
  });

  it('truncates lowest-rank files when budget is exceeded', () => {
    const smallBudgetManager = new ProgressiveDisclosureManager({
      counter,
      extractor,
      config: { ...config, tokenBudget: 100 },
    });
    const plan = smallBudgetManager.disclose(candidates(50));
    expect(plan.totalTokens).toBeLessThanOrEqual(100);
    const paths = plan.contextFiles.map((f) => f.path);
    expect(paths).toContain('src/file0.ts');
    expect(paths).not.toContain('src/file49.ts');
  });

  it('upgrades top files to chunk tier when budget allows', () => {
    const leanManager = new ProgressiveDisclosureManager({
      counter,
      extractor: new SymbolOutlineExtractor(counter, {
        readHead: () => 'x'.repeat(2000),
      }),
      config,
    });
    const plan = leanManager.disclose(candidates(3));
    expect(plan.tier).toBe('chunk');
    expect(plan.contextFiles[0].tier).toBe('chunk');
    expect(plan.contextFiles[0].tokens).toBeGreaterThan(0);
  });

  it('reports symbol tier when no chunk upgrade is possible', () => {
    const noChunkManager = new ProgressiveDisclosureManager({
      counter,
      extractor: new SymbolOutlineExtractor(counter, { readHead: () => '' }),
      config,
    });
    const plan = noChunkManager.disclose(candidates(3));
    expect(plan.tier).toBe('symbol');
    expect(plan.contextFiles.every((f) => f.tier === 'symbol')).toBe(true);
  });

  it('returns empty plan for no candidates', () => {
    const plan = manager.disclose([]);
    expect(plan.contextFiles).toEqual([]);
    expect(plan.totalTokens).toBe(0);
    expect(plan.tier).toBe('symbol');
  });

  it('FsContentReader returns empty for unreadable files', () => {
    expect(new FsContentReader().readHead('no-such-file.ts', 10)).toBe('');
  });
});
