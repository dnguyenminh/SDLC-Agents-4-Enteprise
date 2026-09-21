/**
 * SA4E-308 — Google id_token RS256 verifier.
 * Verifies the id_token signature against Google's JWKS (selected by `kid`),
 * then validates issuer (accounts.google.com), audience (client_id) and exp.
 * Reuses the shared InMemoryJwksCache + httpJwksFetcher infrastructure so key
 * rotation, TTL and single-retry semantics match the Entra verifier.
 */

import { jwtVerify, type KeyInput } from 'jose';
import {
  GoogleIdTokenClaimsSchema,
  type GoogleIdTokenClaims,
  GOOGLE_ISSUERS,
  GOOGLE_JWKS_URI,
} from '../../auth/models/GoogleClaims.js';
import { parseJwtHeader, TokenVerificationError } from './TokenVerifier.js';
import { httpJwksFetcher, InMemoryJwksCache, type JwksCache } from './JwksCache.js';

export interface GoogleVerifierOptions {
  /** Expected `aud` claim — the Google OAuth client_id. */
  audience: string;
  /** Injectable for tests — defaults to the shared cache over Google JWKS. */
  jwksCache?: JwksCache;
}

/** Verifies Google id_tokens and returns validated claims (fail-closed). */
export class GoogleIdTokenVerifier {
  private readonly audience: string;
  private readonly jwksCache: JwksCache;

  constructor(opts: GoogleVerifierOptions) {
    this.audience = opts.audience;
    this.jwksCache = opts.jwksCache ?? new InMemoryJwksCache(httpJwksFetcher(GOOGLE_JWKS_URI));
  }

  /**
   * Verify signature + claims of a Google id_token.
   * @param token Raw id_token JWT.
   * @returns Parsed, schema-validated claims.
   * @throws TokenVerificationError on any signature or claim failure.
   */
  async verify(token: string): Promise<GoogleIdTokenClaims> {
    const key = await this.resolveKey(token);
    const claims = await this.verifySignature(token, key);
    this.assertClaims(claims);
    return claims;
  }

  /** Resolve the signing key for the token's `kid`, mapping failures to 401/503. */
  private async resolveKey(token: string): Promise<KeyInput> {
    const header = parseJwtHeader(token);
    if (!header?.kid) {
      throw new TokenVerificationError('invalid_signature', 'missing or malformed kid', 401);
    }
    let key: KeyInput | null;
    try {
      key = await this.jwksCache.getKey(header.kid);
    } catch {
      throw new TokenVerificationError('jwks_fetch_failed', 'Google JWKS unavailable', 503);
    }
    if (!key) {
      throw new TokenVerificationError('jwks_fetch_failed', 'Google JWKS unavailable', 503);
    }
    return key;
  }

  /** Verify RS256 signature and shape-check the payload with zod safeParse. */
  private async verifySignature(token: string, key: KeyInput): Promise<GoogleIdTokenClaims> {
    let payload: unknown;
    try {
      const result = await jwtVerify(token, key, { algorithms: ['RS256'] });
      payload = result.payload;
    } catch {
      throw new TokenVerificationError('invalid_signature', 'invalid signature', 401);
    }
    const parsed = GoogleIdTokenClaimsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new TokenVerificationError('invalid_signature', 'malformed id_token claims', 401);
    }
    return parsed.data;
  }

  /** Validate issuer, audience and expiry — the OIDC claim checks (fail closed). */
  private assertClaims(claims: GoogleIdTokenClaims): void {
    if (!(GOOGLE_ISSUERS as readonly string[]).includes(claims.iss)) {
      throw new TokenVerificationError('issuer_mismatch', 'issuer mismatch', 401);
    }
    const audOk = Array.isArray(claims.aud)
      ? claims.aud.includes(this.audience)
      : claims.aud === this.audience;
    if (!audOk) {
      throw new TokenVerificationError('audience_mismatch', 'audience mismatch', 401);
    }
    if (claims.exp <= Math.floor(Date.now() / 1000)) {
      throw new TokenVerificationError('token_expired', 'token expired', 401);
    }
  }
}
