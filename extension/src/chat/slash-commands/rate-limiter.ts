/**
 * rate-limiter — token bucket + circuit breaker policies for slash commands.
 * Extracted from CommandRegistry (BR-18); same behavior, same module scope.
 *  - NFR-07-T token-bucket rate limit (20 req/min per session per command)
 *  - NFR-06-T consecutive-failure circuit breaker (half-open probe)
 */

const DEFAULT_RATE_CAPACITY = 20;
const DEFAULT_RATE_REFILL_PER_MS = DEFAULT_RATE_CAPACITY / 60000; // 20 per minute

/** Token bucket per session+command key (NFR-07-T). */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private readonly capacity: number, private readonly refillPerMs: number) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  allow(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }
}

export class RateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly capacity = DEFAULT_RATE_CAPACITY,
    private readonly refillPerMs = DEFAULT_RATE_REFILL_PER_MS
  ) {}

  allow(sessionId: string, commandId: string): boolean {
    const key = `${sessionId}:${commandId}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.capacity, this.refillPerMs);
      this.buckets.set(key, bucket);
    }
    return bucket.allow();
  }
}

/** Thrown when the circuit breaker is open and rejects a call fast. */
export class CircuitBreakerOpenError extends Error {
  constructor(message = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/** Consecutive-failure circuit breaker (OPEN after threshold, half-open probe). */
export class CircuitBreaker {
  private failures = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private openedAt = 0;

  constructor(private readonly threshold = 3, private readonly halfOpenAfterMs = 30000) {}

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt >= this.halfOpenAfterMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new CircuitBreakerOpenError();
      }
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
    }
  }

  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state;
  }
}

/** Reject with Timeout error when the promise does not settle in `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout ${ms}ms exceeded`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
