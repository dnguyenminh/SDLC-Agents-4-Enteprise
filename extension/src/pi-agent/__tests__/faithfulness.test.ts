import { describe, it, expect } from 'vitest';
import { computeFaithfulness, splitClaims, tokenize } from '../faithfulness';

const CONTEXT_SOURCES = [
  { path: 'chat-models.ts', line: 12, excerpt: 'the model has a 2k context window and supports tool calls' },
];

describe('faithfulness rubric', () => {
  it('tokenizes and splits claims', () => {
    expect(tokenize('Chat-Models.ts has 2k tokens!')).toEqual(['chat', 'models', 'ts', 'has', '2k', 'tokens']);
    expect(splitClaims('One claim. Two claims!')).toEqual(['One claim.', 'Two claims!']);
  });

  // STC: TC-001 support — grounded answer receives a high faithfulness score
  it('grounded answer scores high with no issues', () => {
    const result = computeFaithfulness('The model has a 2k context window.', CONTEXT_SOURCES);
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.issues).toEqual([]);
  });

  it('matches the FSD example shape (answer + source citations → score)', () => {
    const result = computeFaithfulness('The model has 2k context', CONTEXT_SOURCES);
    expect(result.score).toBeGreaterThan(0);
    expect(result.issues).toEqual([]);
  });

  // STC: TC-301 support — wrong facts are caught as ungrounded claims
  it('hallucinated answer scores low with issues', () => {
    const result = computeFaithfulness('The API costs 99 dollars per month and requires premium subscription.', CONTEXT_SOURCES);
    expect(result.score).toBeLessThan(0.7);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toContain('Ungrounded claim');
  });

  it('mixed answer scores proportionally', () => {
    const result = computeFaithfulness(
      'The model has a 2k context window. The billing tier costs 99 dollars monthly.',
      CONTEXT_SOURCES
    );
    expect(result.score).toBe(0.5);
    expect(result.issues).toHaveLength(1);
  });

  it('empty answer scores 0', () => {
    const result = computeFaithfulness('', CONTEXT_SOURCES);
    expect(result.score).toBe(0);
    expect(result.issues).toEqual(['Empty answer']);
  });

  it('score is clamped to [0,1] and rounded to 2 decimals', () => {
    const result = computeFaithfulness('Grounded statement about the context window.', []);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('citations contribute path tokens to grounding', () => {
    const result = computeFaithfulness('See chat models.', [{ path: 'chat-models.ts' }]);
    expect(result.score).toBe(1);
  });
});
