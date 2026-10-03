/**
 * admin/db/session-cache.ts — 30s revocation cache for session lookups.
 * Access JWTs verify statelessly; this cache is the only place a logged-out
 * session is noticed before the JWT's own 15-minute expiry.
 */

/** Cache entry lifetime — bounded staleness for a revoked session. */
export const REVOCATION_TTL_MS = 30_000;

interface CacheEntry {
  valid: boolean;
  expires: number;
  /** Cached session identity (shape owned by sessions.ts). */
  value?: unknown;
}

const cache = new Map<string, CacheEntry>();

/** Read a cached session verdict; undefined when absent or stale. */
export function sessionCacheGet(key: string): CacheEntry | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit;
}

/** Store a session verdict for REVOCATION_TTL_MS. */
export function sessionCacheSet(key: string, valid: boolean, value?: unknown): void {
  if (cache.size > 10_000) cache.clear();
  cache.set(key, { valid, expires: Date.now() + REVOCATION_TTL_MS, value });
}

/** Drop one session from the cache (logout / password change). */
export function sessionCacheInvalidate(key: string): void {
  cache.delete(key);
}

/** Drop every cached session (force-logout of a user). */
export function sessionCacheClear(): void {
  cache.clear();
}
