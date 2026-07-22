/**
 * ResponseCache - Simple TTL-based in-memory cache for web tool responses.
 * Prevents redundant external HTTP calls for identical requests within TTL window.
 * BR: max 500 entries, default TTL 5 minutes, evict LRU on overflow.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccess: number;
}

export class ResponseCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs = 5 * 60 * 1000, maxEntries = 500) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  /** Get a cached value, or undefined if missing/expired. */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    entry.lastAccess = Date.now();
    return entry.value;
  }

  /** Store a value with the configured TTL. Evicts LRU entries on overflow. */
  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) this.evictLru();
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs, lastAccess: Date.now() });
  }

  /** Remove all expired entries. */
  purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  get size(): number { return this.store.size; }

  private evictLru(): void {
    let oldest: string | null = null;
    let oldestAccess = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.lastAccess < oldestAccess) { oldestAccess = entry.lastAccess; oldest = key; }
    }
    if (oldest) this.store.delete(oldest);
  }
}
