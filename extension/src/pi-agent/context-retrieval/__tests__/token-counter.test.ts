import { describe, it, expect } from 'vitest';
import { TokenCounter } from '../token-counter';

describe('TokenCounter', () => {
  const counter = new TokenCounter();

  it('returns 0 for empty text', () => {
    expect(counter.estimate('')).toBe(0);
    expect(counter.estimate(undefined as any)).toBe(0);
  });

  it('returns at least 1 token for non-empty text', () => {
    expect(counter.estimate('a')).toBe(1);
  });

  it('estimates more tokens for longer text', () => {
    const short = counter.estimate('hello world');
    const long = counter.estimate(`${'hello world '.repeat(50)}`);
    expect(long).toBeGreaterThan(short);
  });

  it('is deterministic for the same input', () => {
    const text = 'const x = computeBudget(symbols, 6000);';
    expect(counter.estimate(text)).toBe(counter.estimate(text));
  });

  it('fits checks budget correctly', () => {
    expect(counter.fits('abcd', 1)).toBe(true);
    expect(counter.fits('abcd', 0)).toBe(false);
  });
});
