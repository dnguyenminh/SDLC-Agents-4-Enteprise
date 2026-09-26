import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker } from '../circuit-breaker';

describe('CircuitBreaker (SA4E-327 sub-agent protection)', () => {
  it('stays closed below the failure threshold', () => {
    const breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 1000 });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
    expect(breaker.canProceed()).toBe(true);
  });

  it('opens after the failure threshold is reached', () => {
    const breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 1000 });
    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
    expect(breaker.canProceed()).toBe(false);
  });

  it('moves to half-open after the cooldown elapses', () => {
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 10 });
    breaker.recordFailure();
    expect(breaker.canProceed()).toBe(false);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 20);
    expect(breaker.getState()).toBe('open');
    expect(breaker.canProceed()).toBe(true);
    expect(breaker.getState()).toBe('half-open');
    vi.useRealTimers();
  });

  it('closes again after a successful half-open trial', () => {
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 10 });
    breaker.recordFailure();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 20);
    breaker.canProceed();
    breaker.recordSuccess();
    expect(breaker.getState()).toBe('closed');
    vi.useRealTimers();
  });

  it('re-opens when a half-open trial fails', () => {
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 10 });
    breaker.recordFailure();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 20);
    breaker.canProceed();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
    vi.useRealTimers();
  });

  it('resets the failure counter on success while closed', () => {
    const breaker = new CircuitBreaker({ threshold: 2, cooldownMs: 1000 });
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
  });
});
