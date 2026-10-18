/**
 * AuthManager — token expiry / proactive-refresh heuristics (pure functions).
 */

import type { AuthState } from "./auth-types";

export function isTokenExpired(tokenExpiresAt: number | null, tokenAcquiredAt: number | null): boolean {
  if (!tokenExpiresAt) {
    if (!tokenAcquiredAt) return false;
    return Date.now() > tokenAcquiredAt + 3_600_000;
  }
  return Date.now() > tokenExpiresAt - 60_000;
}

/**
 * Should the token be proactively refreshed now? True once the token has
 * entered the last quarter of its lifetime (or the last 10 min if lifetime is
 * short). This avoids rotating the session token too eagerly — the backend
 * rotation invalidates the old token, which would break in-flight long
 * operations (e.g. a Pega crawl) that are still holding it.
 */
export function shouldRefreshTokenNow(state: AuthState, tokenExpiresAt: number | null, tokenAcquiredAt: number | null): boolean {
  if (state !== "AUTHENTICATED") return false;
  if (!tokenExpiresAt) {
    // No expiry known — fall back to refreshing after ~45 min of a 60 min assumption.
    if (!tokenAcquiredAt) return false;
    return Date.now() > tokenAcquiredAt + 45 * 60_000;
  }
  const acquired = tokenAcquiredAt ?? (tokenExpiresAt - 24 * 3_600_000);
  const lifetime = Math.max(tokenExpiresAt - acquired, 60_000);
  const threshold = tokenExpiresAt - Math.min(lifetime * 0.25, 6 * 3_600_000);
  return Date.now() >= threshold;
}
