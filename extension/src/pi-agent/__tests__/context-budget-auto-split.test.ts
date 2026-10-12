import { describe, it, expect } from 'vitest';
import { chunkPrompt, shouldAutoChunk, synthesizeChunks, estimateTokens, DEFAULT_AUTO_CHUNK_CONFIG, MEDIUM_AUTO_CHUNK_RATIO } from '../context-budget-auto-split';
import { usableTokensOf } from '../models/ContextBudget';

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

// STC: SA4E-355 UAT fix #2 — shouldAutoChunk must be history-aware: medium
// (and large) tiers trigger when promptTokens + historyTokens approach nCtx
// (> 70% of the usable budget), not only small tier.
describe('shouldAutoChunk — history-aware medium/large tiers (SA4E-355 UAT)', () => {
  const cfg = DEFAULT_AUTO_CHUNK_CONFIG;
  // Real qwen UAT budget: nCtx 65536, reserve 2048, margin ceil(65536*0.08)=5243 → usable 58245.
  const usable = usableTokensOf({ nCtx: 65536, reserveOutput: 2048, safetyMargin: 5243, staticBudget: 0, historyBudget: 0 });

  it('usableTokensOf applies the BR-02 math (nCtx − reserve − margin)', () => {
    expect(usable).toBe(58245);
  });

  it('medium tier triggers when prompt + history exceed 70% of usable budget', () => {
    // 30000 + 20000 = 50000 > 58245 * 0.7 = 40771.5 → approaching nCtx → chunk.
    expect(shouldAutoChunk('medium', 30000, cfg, { usableTokens: usable, historyTokens: 20000 })).toBe(true);
  });

  it('medium tier stays false well below the threshold', () => {
    expect(shouldAutoChunk('medium', 1000, cfg, { usableTokens: usable, historyTokens: 1000 })).toBe(false);
  });

  it('history alone can push a small prompt over the threshold', () => {
    // UAT root cause #3: the 73k tokens came from accumulated history, not the prompt.
    expect(shouldAutoChunk('medium', 500, cfg, { usableTokens: usable, historyTokens: 45000 })).toBe(true);
  });

  it('boundary: exactly at the ratio is false (strictly-greater rule)', () => {
    const u = 10000;
    expect(shouldAutoChunk('medium', 7000, cfg, { usableTokens: u, historyTokens: 0 })).toBe(false);
    expect(shouldAutoChunk('medium', 7001, cfg, { usableTokens: u, historyTokens: 0 })).toBe(true);
  });

  it('medium tier without threshold info fails open → false (back-compat)', () => {
    expect(shouldAutoChunk('medium', 5000, cfg)).toBe(false);
    expect(shouldAutoChunk('medium', 5000, cfg, {})).toBe(false);
  });

  it('invalid usableTokens (0 / NaN / negative) → false', () => {
    expect(shouldAutoChunk('medium', 5000, cfg, { usableTokens: 0 })).toBe(false);
    expect(shouldAutoChunk('medium', 5000, cfg, { usableTokens: Number.NaN })).toBe(false);
    expect(shouldAutoChunk('medium', 5000, cfg, { usableTokens: -100 })).toBe(false);
  });

  it('large tier is guarded by the same ratio rule', () => {
    expect(shouldAutoChunk('large', 10000, cfg, { usableTokens: 12000, historyTokens: 1000 })).toBe(true);
    expect(shouldAutoChunk('large', 1000, cfg, { usableTokens: 12000, historyTokens: 100 })).toBe(false);
  });

  it('small tier keeps its own rule regardless of threshold', () => {
    expect(shouldAutoChunk('small', 5000, cfg, { usableTokens: 100000, historyTokens: 0 })).toBe(true);
    expect(shouldAutoChunk('small', 100, cfg, { usableTokens: 10, historyTokens: 100 })).toBe(false);
  });

  it('negative historyTokens are clamped to 0', () => {
    expect(shouldAutoChunk('medium', 5000, cfg, { usableTokens: 10000, historyTokens: -50 })).toBe(false);
  });

  it('MEDIUM_AUTO_CHUNK_RATIO is 0.7 (documented approach threshold)', () => {
    expect(MEDIUM_AUTO_CHUNK_RATIO).toBe(0.7);
  });
});
