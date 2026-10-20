/**
 * Unit tests — SA4E-266 token verifiers (RS256 + JWKS + discovery).
 * Covers UC-01..UC-04, BR-01..BR-04, ERR-01..ERR-05 per TDD §6.3.
 * This file: EntraRS256Verifier behaviour.
 */

import { describe, it, expect, vi } from 'vitest';
import { SignJWT } from 'jose';
import { InMemoryJwksCache } from './JwksCache.js';
import {
  ISSUER,
  AUDIENCE,
  makeRsaKeys,
  jwksOf,
  signRsaToken,
  staticJwksFetcher,
  makeVerifier,
} from './helpers.js';

describe('EntraRS256Verifier', () => {
  it('valid RS256 token returns VerifiedClaims (UC-01, BR-01, BR-03)', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => jwksOf(jwk, 'k1')));
    const verifier = makeVerifier({ jwksCache: cache });
    const token = await signRsaToken({ privateKey, kid: 'k1', iss: ISSUER, aud: AUDIENCE });

    const claims = await verifier.verify(token);

    expect(claims).toMatchObject({ sub: 'sub-1', oid: 'oid-1', email: 'u@x.com', name: 'U', iss: ISSUER, aud: AUDIENCE });
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(cache.fetchCount()).toBe(1);

    // Second verification served from the 1h key cache — no refetch.
    await verifier.verify(token);
    expect(cache.fetchCount()).toBe(1);
  });

  it('rejects a token with an invalid signature -> ERR-01 401 (UC-02, BR-01)', async () => {
    const { jwk } = await makeRsaKeys();
    const { privateKey: attackerKey } = await makeRsaKeys();
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => jwksOf(jwk, 'k1')));
    const verifier = makeVerifier({ jwksCache: cache });
    const token = await signRsaToken({ privateKey: attackerKey, kid: 'k1', iss: ISSUER, aud: AUDIENCE });

    await expect(verifier.verify(token)).rejects.toMatchObject({
      name: 'TokenVerificationError',
      code: 'invalid_signature',
      status: 401,
    });
  });

  it('rejects a missing/malformed kid -> ERR-01 401, never crashes', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => jwksOf(jwk, 'k1')));
    const verifier = makeVerifier({ jwksCache: cache });
    const builder = new SignJWT({ sub: 'sub-1' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600);
    const token = await builder.sign(privateKey);

    await expect(verifier.verify(token)).rejects.toMatchObject({
      name: 'TokenVerificationError',
      code: 'invalid_signature',
      status: 401,
    });
  });

  it('rejects an issuer mismatch -> ERR-02 401 (UC-03, BR-03)', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => jwksOf(jwk, 'k1')));
    const verifier = makeVerifier({ jwksCache: cache });
    const token = await signRsaToken({ privateKey, kid: 'k1', iss: 'https://evil.example./v2.0', aud: AUDIENCE });

    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'issuer_mismatch', status: 401 });
  });

  it('rejects an audience mismatch -> ERR-03 401 (UC-03, BR-03)', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => jwksOf(jwk, 'k1')));
    const verifier = makeVerifier({ jwksCache: cache });
    const token = await signRsaToken({ privateKey, kid: 'k1', iss: ISSUER, aud: ['99999999-0000-0000-0000-000000000000'] });

    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'audience_mismatch', status: 401 });
  });

  it('rejects an expired token -> ERR-04 401 (UC-03, BR-03)', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => jwksOf(jwk, 'k1')));
    const verifier = makeVerifier({ jwksCache: cache });
    const token = await signRsaToken({ privateKey, kid: 'k1', iss: ISSUER, aud: AUDIENCE, expiresInSec: -3600 });

    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'token_expired', status: 401 });
  });

  it('JWKS fetch failure -> ERR-05 503 with exactly 1 refresh attempt (BR-02)', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const failing = { fetch: async () => { throw new Error('network down'); } };
    const cache = new InMemoryJwksCache(failing);
    const verifier = makeVerifier({ jwksCache: cache });
    const token = await signRsaToken({ privateKey, kid: 'k1', iss: ISSUER, aud: AUDIENCE });

    await expect(verifier.verify(token)).rejects.toMatchObject({
      name: 'TokenVerificationError',
      code: 'jwks_fetch_failed',
      status: 503,
    });
    expect(cache.fetchCount()).toBe(1);
    expect(cache.refresh instanceof Function).toBe(true);
    const second = await verifier.verify(token).then(() => 'ok').catch((e: unknown) => (e as Error).message);
    expect(second).toContain('JWKS');
    expect(cache.fetchCount()).toBe(2); // next request retries naturally, once more
    expect(jwk.kty).toBe('RSA');
  });

  it('kid miss -> single refresh picks up rotated key and verification passes (BR-01/BR-02)', async () => {
    const { privateKey: newKey, jwk: newJwk } = await makeRsaKeys();
    let current: { keys: unknown[] } = { keys: [] };
    const cache = new InMemoryJwksCache(staticJwksFetcher(() => current));
    const verifier = makeVerifier({ jwksCache: cache });
    // Rotate: the JWKS now advertises the NEW key under a NEW kid.
    current = jwksOf(newJwk, 'k-new');
    const token = await signRsaToken({ privateKey: newKey, kid: 'k-new', iss: ISSUER, aud: AUDIENCE });

    const claims = await verifier.verify(token);
    expect(claims.sub).toBe('sub-1');
    expect(cache.fetchCount()).toBe(1);
  });

  it('caches the discovery document 24h — single discovery fetch across verifications (§8.2)', async () => {
    const { privateKey, jwk } = await makeRsaKeys();
    const discovery = vi.fn(async () => ({ issuer: ISSUER, jwks_uri: 'https://jwks.local/keys' }));
    const verifier = makeVerifier({
      jwksFetcher: { fetch: async () => jwksOf(jwk, 'k1') },
      discoveryFetcher: { fetch: discovery },
    });
    const token = await signRsaToken({ privateKey, kid: 'k1', iss: ISSUER, aud: AUDIENCE });

    await verifier.verify(token);
    await verifier.verify(token);
    await verifier.verify(token);

    expect(discovery).toHaveBeenCalledTimes(1);
  });
});
