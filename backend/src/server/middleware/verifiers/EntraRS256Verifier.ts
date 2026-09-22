/**
 * RS256 Entra ID token verifier (SA4E-266, BR-01 / BR-03).
 * Signature validated against the JWKS public key selected by `kid`; claims
 * `iss`, `aud`, `exp` validated strictly. OIDC discovery is resolved from
 * ENTRA_AUTHORITY and cached 24h ("confirm issuer"); the jwks_uri it yields
 * feeds the JwksCache (TTL 1h), unless ENTRA_JWKS_URI overrides key fetching.
 */

import { jwtVerify, type KeyInput } from 'jose';
import {
  TokenVerificationError,
  parseJwtHeader,
  type TokenVerifier,
  type VerifiedClaims,
} from './TokenVerifier.js';
import {
  httpJwksFetcher,
  InMemoryJwksCache,
  type JwksCache,
  type JwksFetcher,
} from './JwksCache.js';

export interface DiscoveryDocument {
  issuer: string;
  jwks_uri: string;
}

export interface DiscoveryFetcher {
  fetch(): Promise<DiscoveryDocument>;
}

/** Default: GET the OIDC discovery document from the configured authority. */
export function httpDiscoveryFetcher(authority: string): DiscoveryFetcher {
  const base = authority.replace(/\/+$/, '');
  return {
    async fetch() {
      const res = await fetch(`${base}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`OIDC discovery failed: HTTP ${res.status}`);
      return (await res.json()) as DiscoveryDocument;
    },
  };
}

const DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface EntraVerifierOptions {
  /** Authority base URL — source of the OIDC discovery request. */
  authority: string;
  /** Expected `iss` claim value (ERR-02). */
  issuer: string;
  /** Expected `aud` claim value — the Entra client/app ID. */
  audience: string;
  /** Optional override of the discovered jwks_uri (ENTRA_JWKS_URI). */
  jwksUri?: string;
  /** Injectable for tests. Defaults to httpDiscoveryFetcher(authority). */
  discoveryFetcher?: DiscoveryFetcher;
  /** Injectable for tests. Defaults to httpJwksFetcher(jwksUri|discovered). */
  jwksFetcher?: JwksFetcher;
  /** Injectable for tests. Defaults to a new InMemoryJwksCache(fetcher). */
  jwksCache?: JwksCache;
}

export class EntraRS256Verifier implements TokenVerifier {
  private readonly configuredIssuer: string;
  private readonly audience: string;
  private readonly discoveryFetcher: DiscoveryFetcher;
  private readonly jwksCache: JwksCache;
  private discovered: DiscoveryDocument | null = null;
  private discoveredAt = 0;

  constructor(opts: EntraVerifierOptions) {
    this.configuredIssuer = opts.issuer;
    this.audience = opts.audience;
    this.discoveryFetcher = opts.discoveryFetcher ?? httpDiscoveryFetcher(opts.authority);

    const jwksFetcher: JwksFetcher =
      opts.jwksFetcher ??
      (opts.jwksUri
        ? httpJwksFetcher(opts.jwksUri)
        : {
            fetch: async () => {
              const doc = await this.ensureDiscovery();
              return httpJwksFetcher(doc.jwks_uri).fetch();
            },
          });

    this.jwksCache = opts.jwksCache ?? new InMemoryJwksCache(jwksFetcher);
  }

  async verify(token: string): Promise<VerifiedClaims> {
    const header = parseJwtHeader(token);
    if (!header?.kid) {
      throw new TokenVerificationError('invalid_signature', 'missing or malformed kid', 401);
    }

    try {
      await this.ensureDiscovery();
    } catch {
      throw new TokenVerificationError('jwks_fetch_failed', 'OIDC discovery unavailable', 503);
    }

    let key: KeyInput | null;
    try {
      key = await this.jwksCache.getKey(header.kid);
    } catch {
      throw new TokenVerificationError('jwks_fetch_failed', 'JWKS unavailable after refresh attempt', 503);
    }
    if (!key) {
      throw new TokenVerificationError('jwks_fetch_failed', 'JWKS unavailable after refresh attempt', 503);
    }

    let claims: Payload;
    try {
      const result = await jwtVerify(token, key, { algorithms: ['RS256'] });
      claims = result.payload as Payload;
    } catch (err) {
      throw mapJoseError(err);
    }

    if (claims.iss !== this.configuredIssuer) {
      throw new TokenVerificationError('issuer_mismatch', 'issuer mismatch', 401);
    }
    if (!audienceMatches(this.audience, claims.aud)) {
      throw new TokenVerificationError('audience_mismatch', 'audience mismatch', 401);
    }
    if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) {
      throw new TokenVerificationError('token_expired', 'token expired', 401);
    }

    return {
      sub: claims.sub ?? '',
      oid: claims.oid ?? '',
      email: claims.email ?? '',
      name: claims.name ?? '',
      iss: claims.iss ?? this.configuredIssuer,
      aud: typeof claims.aud === 'string' ? claims.aud : this.audience,
      exp: claims.exp,
    };
  }

  /** Resolved once and cached 24h — single discovery fetch across verifications. */
  private async ensureDiscovery(): Promise<DiscoveryDocument> {
    if (this.discovered && Date.now() - this.discoveredAt < DISCOVERY_TTL_MS) {
      return this.discovered;
    }
    const doc = await this.discoveryFetcher.fetch();
    this.discovered = doc;
    this.discoveredAt = Date.now();
    return doc;
  }
}

interface Payload {
  sub?: string;
  oid?: string;
  email?: string;
  name?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  [key: string]: unknown;
}

function audienceMatches(expected: string, actual: string | string[] | undefined): boolean {
  if (Array.isArray(actual)) return actual.includes(expected);
  return actual === expected;
}

function mapJoseError(err: unknown): TokenVerificationError {
  const code = (err as { code?: string } | undefined)?.code;
  if (code === 'ERR_JWT_EXPIRED') {
    return new TokenVerificationError('token_expired', 'token expired', 401);
  }
  if (
    code === 'ERR_JWT_SIGNATURE_VERIFICATION_FAILED' ||
    code === 'ERR_JWS_INVALID' ||
    code === 'ERR_JWT_INVALID'
  ) {
    return new TokenVerificationError('invalid_signature', 'invalid signature', 401);
  }
  return new TokenVerificationError('invalid_signature', 'invalid token', 401);
}