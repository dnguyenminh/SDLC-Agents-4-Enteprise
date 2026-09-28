import { describe, it, expect } from 'vitest';
import { compressPrompt, CompressedVariant, estimateTokenCount, COMPRESSION_MAX_RATIO } from '../prompt-compressor';

const FULL_TEMPLATE = `# BRD Agent Prompt

You are the BA agent. Create the BRD document with user stories and acceptance criteria.

<!-- internal note: do not share -->
Tip: always ask the stakeholder for priorities.

Example:
{"story": 1, "title": "Login"}
{"story": 2, "title": "Logout"}

## Output
Write to documents/{TICKET}/BRD.md.
`;

describe('prompt-compressor', () => {
  // STC: TC-001 — Prompt Compression for Small Model (compressed smaller than full)
  it('compressed output is smaller than full template', () => {
    const compressed = compressPrompt(FULL_TEMPLATE);
    expect(compressed.length).toBeGreaterThan(0);
    expect(compressed.length).toBeLessThan(FULL_TEMPLATE.length);
  });

  it('meets ≤60% budget for example-heavy template (BR-NFR)', () => {
    const variant = CompressedVariant.from(FULL_TEMPLATE);
    expect(variant.ratio).toBeLessThanOrEqual(COMPRESSION_MAX_RATIO);
    expect(variant.withinBudget).toBe(true);
  });

  it('strips example sections and boilerplate', () => {
    const compressed = compressPrompt(FULL_TEMPLATE);
    expect(compressed).not.toContain('Example:');
    expect(compressed).not.toContain('Tip:');
    expect(compressed).not.toContain('<!-- internal note');
    expect(compressed).toContain('documents/{TICKET}/BRD.md');
  });

  it('keeps essential instructions and headings', () => {
    const compressed = compressPrompt(FULL_TEMPLATE);
    expect(compressed).toContain('# BRD Agent Prompt');
    expect(compressed).toContain('## Output');
    expect(compressed).toContain('user stories and acceptance criteria');
  });

  it('collapses redundant whitespace', () => {
    const compressed = compressPrompt('Line one.\n\n\n\nLine two.   \n   Line three.');
    expect(compressed).toBe('Line one.\n\nLine two.\nLine three.');
  });

  // COMPRESSION_FAIL → return original
  it('returns original on compression failure (empty input)', () => {
    expect(compressPrompt('')).toBe('');
  });

  it('returns original when template is already terse (nothing gained)', () => {
    const terse = 'Do the task.';
    expect(compressPrompt(terse)).toBe(terse);
  });

  it('CompressedVariant exposes ratio, budget and token metrics', () => {
    const variant = CompressedVariant.from(FULL_TEMPLATE);
    expect(variant.source).toBe(FULL_TEMPLATE);
    expect(variant.content.length).toBeLessThan(variant.source.length);
    expect(variant.tokenCount).toBe(estimateTokenCount(variant.content));
  });

  it('estimateTokenCount approximates 4 chars per token', () => {
    expect(estimateTokenCount('abcd')).toBe(1);
    expect(estimateTokenCount('abcde')).toBe(2);
    expect(estimateTokenCount('')).toBe(0);
  });
});
