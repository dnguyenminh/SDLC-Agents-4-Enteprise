/**
 * JWKS key cache (SA4E-266, BR-02).
 * TTL 1h per key; on an unknown/expired `kid` the cache performs exactly one
 * refresh and re-checks once. The single-retry cap is enforced with in-flight
 * dedup so a forged `kid` cannot force unbounded outbound fetches.
 */

import { importJWK, type KeyInput, type JWK } from 'jose';

export interface JwksSet {
  keys: unknown[];
}

/** Minimal fetch contract — tests inject fake responses and count calls. */
export interface JwksFetcher {
  fetch(): Promise<JwksSet>;
}

/** Default: GET the JWKS document over HTTP(S). Never throws to the caller's surprise path. */
export function httpJwksFetcher(jwksUri: string): JwksFetcher {
  return {
    async fetch() {
      const res = await fetch(jwksUri, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`JWKS fetch failed: HTTP ${res.status}`);
      return (await res.json()) as JwksSet;
    },
  };
}

export interface JwksCache {
  getKey(kid: string): Promise<KeyInput | null>;
  refresh(): Promise<void>;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h

interface Entry {
  publicKey: KeyInput;
  fetchedAt: number;
  ttlMs: number;
}

export class InMemoryJwksCache implements JwksCache {
  private entries = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly fetcher: JwksFetcher;
  private fetchAttempts = 0;
  private inFlight: Promise<void> | null = null;

  constructor(fetcher: JwksFetcher, ttlMs: number = DEFAULT_TTL_MS) {
    this.fetcher = fetcher;
    this.ttlMs = ttlMs;
  }

  /** Test/debug helper — number of actual JWKS fetch attempts performed. */
  fetchCount(): number {
    return this.fetchAttempts;
  }

  async getKey(kid: string): Promise<KeyInput | null> {
    const fresh = this.peekFresh(kid);
    if (fresh) return fresh;
    // Cache miss / expired → exactly one refresh retry (deduped), then re-check once.
    await this.refresh();
    return this.peekFresh(kid);
  }

  async refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.doRefresh().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async doRefresh(): Promise<void> {
    try {
      const doc = await this.fetcher.fetch();
      const next = new Map<string, Entry>();
      for (const jwk of doc.keys) {
        const kid = (jwk as Record<string, unknown> | undefined)?.kid;
        if (typeof kid !== 'string' || !kid) continue;
        try {
          const publicKey = await importJWK(jwk as JWK, 'RS256');
          next.set(kid, { publicKey, fetchedAt: Date.now(), ttlMs: this.ttlMs });
        } catch {
          // Unsupported/malformed key — skip, never abort the refresh.
        }
      }
      this.entries = next;
    } catch {
      // Fail closed (§4.2): cache stays empty/expired — caller maps to 503 ERR-05.
    } finally {
      this.fetchAttempts += 1;
    }
  }

  private peekFresh(kid: string): KeyInput | null {
    const entry = this.entries.get(kid);
    if (entry && Date.now() - entry.fetchedAt < entry.ttlMs) return entry.publicKey;
    return null;
  }
}