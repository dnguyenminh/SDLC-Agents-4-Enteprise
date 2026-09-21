/**
 * SA4E-308 — Unit tests for GoogleIdTokenVerifier.
 * Verifies claim checks: issuer (accounts.google.com w/ and w/o scheme), audience
 * (client_id), expiry, malformed claims, and JWKS resolution failures. jose.jwtVerify
 * is mocked so we test claim logic without real RS256 crypto; the cache is injected.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock jose.jwtVerify — return a controllable payload per test.
const jwtVerifyMock = vi.fn();
vi.mock('jose', () => ({ jwtVerify: (...args: unknown[]) => jwtVerifyMock(...args) }));

const { GoogleIdTokenVerifier } = await import('../GoogleIdTokenVerifier.js');

const AUDIENCE = 'client-id.apps.googleusercontent.com';
const FUTURE = Math.floor(Date.now() / 1000) + 3600;
const PAST = Math.floor(Date.now() / 1000) - 10;

/** A token with a resolvable kid header. */
function tokenWithKid(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url');
  return `${header}.body.sig`;
}

/** JWKS cache stub that always returns a fake key for any kid. */
const okCache = { getKey: vi.fn().mockResolvedValue('fake-key'), refresh: vi.fn() };

function makeVerifier(cache = okCache) {
  return new GoogleIdTokenVerifier({ audience: AUDIENCE, jwksCache: cache as never });
}

describe('GoogleIdTokenVerifier', () => {
  beforeEach(() => {
    jwtVerifyMock.mockReset();
    okCache.getKey.mockClear().mockResolvedValue('fake-key');
  });

  it('accepts a valid token (https issuer, matching aud, future exp)', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { iss: 'https://accounts.google.com', aud: AUDIENCE, sub: 's1', exp: FUTURE, email: 'a@b.com' },
    });
    const claims = await makeVerifier().verify(tokenWithKid());
    expect(claims.sub).toBe('s1');
    expect(claims.email).toBe('a@b.com');
  });

  it('accepts the bare "accounts.google.com" issuer', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { iss: 'accounts.google.com', aud: AUDIENCE, sub: 's1', exp: FUTURE },
    });
    await expect(makeVerifier().verify(tokenWithKid())).resolves.toBeTruthy();
  });

  it('rejects a wrong issuer', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { iss: 'https://evil.example.com', aud: AUDIENCE, sub: 's1', exp: FUTURE },
    });
    await expect(makeVerifier().verify(tokenWithKid())).rejects.toMatchObject({ code: 'issuer_mismatch' });
  });

  it('rejects a wrong audience', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { iss: 'https://accounts.google.com', aud: 'other-client', sub: 's1', exp: FUTURE },
    });
    await expect(makeVerifier().verify(tokenWithKid())).rejects.toMatchObject({ code: 'audience_mismatch' });
  });

  it('accepts audience when aud is an array containing the client_id', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { iss: 'https://accounts.google.com', aud: ['x', AUDIENCE], sub: 's1', exp: FUTURE },
    });
    await expect(makeVerifier().verify(tokenWithKid())).resolves.toBeTruthy();
  });

  it('rejects an expired token', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { iss: 'https://accounts.google.com', aud: AUDIENCE, sub: 's1', exp: PAST },
    });
    await expect(makeVerifier().verify(tokenWithKid())).rejects.toMatchObject({ code: 'token_expired' });
  });

  it('rejects malformed claims (missing sub)', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { iss: 'https://accounts.google.com', aud: AUDIENCE, exp: FUTURE },
    });
    await expect(makeVerifier().verify(tokenWithKid())).rejects.toMatchObject({ code: 'invalid_signature' });
  });

  it('rejects a token without a kid header', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
    await expect(makeVerifier().verify(`${header}.body.sig`))
      .rejects.toMatchObject({ code: 'invalid_signature' });
  });

  it('maps a signature verification failure to invalid_signature', async () => {
    jwtVerifyMock.mockRejectedValue(new Error('bad sig'));
    await expect(makeVerifier().verify(tokenWithKid())).rejects.toMatchObject({ code: 'invalid_signature' });
  });

  it('maps a JWKS resolution miss to jwks_fetch_failed (503)', async () => {
    const missCache = { getKey: vi.fn().mockResolvedValue(null), refresh: vi.fn() };
    await expect(makeVerifier(missCache).verify(tokenWithKid()))
      .rejects.toMatchObject({ code: 'jwks_fetch_failed', status: 503 });
  });
});
