export type BreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  threshold: number;
  cooldownMs: number;
}

/** Default options for the shared session-scoped breaker (SEC-327-01). */
export const DEFAULT_BREAKER_OPTIONS: CircuitBreakerOptions = { threshold: 3, cooldownMs: 60_000 };

// SEC-327-01: one breaker per extension session (module scope). Failure state
// persists across queries AND orchestrator re-instantiations, so a persistent
// sub-agent outage opens the circuit once instead of paying full-cost retries
// on every query. Explicit injection into MapReduceOrchestrator deps still wins.
let sharedBreaker: CircuitBreaker | null = null;

/**
 * Shared (session-scoped) circuit breaker — singleton via DI-friendly factory.
 * Scope: one instance per extension session; closes the "bypass by
 * re-instantiation" threat where a per-orchestrator breaker resets each query.
 */
export function getSharedCircuitBreaker(
  options: CircuitBreakerOptions = DEFAULT_BREAKER_OPTIONS
): CircuitBreaker {
  if (!sharedBreaker) {
    sharedBreaker = new CircuitBreaker(options);
  }
  return sharedBreaker;
}

/** Test/teardown hook — drops the shared instance so the next get creates a fresh closed breaker. */
export function resetSharedCircuitBreaker(): void {
  sharedBreaker = null;
}

export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private failures = 0;
  private openedAt = 0;

  constructor(private readonly opts: CircuitBreakerOptions) {}

  getState(): BreakerState {
    return this.state;
  }

  canProceed(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open' && Date.now() - this.openedAt >= this.opts.cooldownMs) {
      this.state = 'half-open';
    }
    return this.state !== 'open';
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.state === 'half-open' || this.failures >= this.opts.threshold) {
      this.open();
    }
  }

  private open(): void {
    this.state = 'open';
    this.openedAt = Date.now();
    this.failures = 0;
  }
}
