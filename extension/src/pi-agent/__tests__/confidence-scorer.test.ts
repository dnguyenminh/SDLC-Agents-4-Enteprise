import { describe, it, expect } from 'vitest';
import { ConfidenceScorer, SCORE_FAILURE_DEFAULT } from '../confidence-scorer';

// STC: TC-002 — Low confidence detection feeds escalation
// FSD 12.2 — ConfidenceScorer.score: SCORE_FAIL -> 0.5

describe('ConfidenceScorer', () => {
  const scorer = new ConfidenceScorer();

  it('parses structured confidence from model output (FSD example: 0.62)', () => {
    expect(scorer.score('{"answer": "…", "confidence": 0.62}')).toBe(0.62);
    expect(scorer.score('Confidence: 0.71 - final answer below')).toBe(0.71);
    expect(scorer.score('confidence=1')).toBe(1);
  });

  it('hedging language scores low (below 0.75 threshold)', () => {
    expect(scorer.score("I'm not sure about the result")).toBe(0.3);
    expect(scorer.score('I apologize, I do not know the answer')).toBe(0.3);
  });

  it('confident language scores high', () => {
    expect(scorer.score('The answer is 42')).toBe(0.9);
    expect(scorer.score('Here is the corrected function')).toBe(0.9);
  });

  it('neutral answer gets default heuristic score', () => {
    expect(scorer.score('plain statement without markers')).toBe(0.8);
  });

  it('SCORE_FAIL: missing/empty answer returns 0.5', () => {
    expect(scorer.score(undefined)).toBe(SCORE_FAILURE_DEFAULT);
    expect(scorer.score(null)).toBe(SCORE_FAILURE_DEFAULT);
    expect(scorer.score('   ')).toBe(SCORE_FAILURE_DEFAULT);
  });

  it('out-of-range structured confidence falls back to heuristic', () => {
    expect(scorer.score('confidence: 2.5 plain text')).toBe(0.8);
    expect(ConfidenceScorer.parseStructuredConfidence('confidence: 9')).toBeUndefined();
  });
});
