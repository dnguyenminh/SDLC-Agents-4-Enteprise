/**
 * Integration Tests — Google OAuth2 Auth Code + PKCE / OIDC (SA4E-308).
 * Exercises the full GoogleProviderStrategy flow through ssoStrategyRegistry:
 *  - login URL generation (authorize endpoint, PKCE S256, scope, state, nonce)
 *  - callback: mock token endpoint + real jose id_token verification against an
 *    in-memory JWKS built from a locally generated RSA key pair.
 * Mirrors the shape of entra-oauth.it.test.ts.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { InMemoryJwksCache, type JwksFetcher } from '../../src/server/middleware/verifiers/JwksCache.js';
import { GoogleIdTokenVerifier } from '../../src/server/middleware/verifiers/GoogleIdTokenVerifier.js';

const CLIENT_ID = 'client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'google-secret-123';
const REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
const ISSUER = 'https://accounts.google.com';
const KID = 'google-test-key';

// ---- Mock the config loader (no DB in integration test) ----
const loadGoogleConfigMock = vi.fn().mockResolvedValue({
  clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI,
  scopes: ['openid', 'email', 'profile'],
});
vi.mock('../../src/server/auth/strategies/GoogleProviderConfig.js', () => ({
  loadGoogleConfig: () => loadGoogleConfigMock(),
  GoogleConfigError: class GoogleConfigError extends Error {},
}));

const { GoogleProviderStrategy } = await import('../../src/server/auth/strategies/GoogleProviderStrategy.js');

let privateKey: CryptoKey;
let publicJwk: JWK;

/** JWKS fetcher backed by the locally generated public key. */
const jwksFetcher: JwksFetcher = {
  async fetch() {
    return { keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] };
  },
};

/** Verifier factory that verifies against the in-memory JWKS (no network). */
function testVerifierFactory(audience: string) {
  return new GoogleIdTokenVerifier({ audience, jwksCache: new InMemoryJwksCache(jwksFetcher) });
}

/** Sign a Google-style id_token with the test RSA key. */
async function signIdToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}

/** Mock the Google token endpoint to return a given id_token; assert code_verifier. */
function mockTokenEndpoint(idToken: string): void {
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: { body?: string }) => {
    const body = new URLSearchParams(init?.body ?? '');
    expect(body.get('code_verifier')).toBeTruthy();
    expect(body.get('grant_type')).toBe('authorization_code');
    return { ok: true, status: 200, json: async () => ({ id_token: idToken, access_token: 'at' }) } as unknown as Response;
  }));
}

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey;
  publicJwk = await exportJWK(kp.publicKey);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Google OAuth2 PKCE — Login URL Generation', () => {
  it('builds an authorize URL with Google endpoint, PKCE S256, scope, state, nonce', async () => {
    const strategy = new GoogleProviderStrategy(testVerifierFactory);
    const result = await strategy.buildAuthorizeUrl({ state: 'customstate123' });

    const url = new URL(result.url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.pathname).toBe('/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('customstate123');
    expect(url.searchParams.get('nonce')).toBeTruthy();
    expect(url.searchParams.get('scope')).toContain('openid');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
  });

  it('generates a random state when not provided', async () => {
    const strategy = new GoogleProviderStrategy(testVerifierFactory);
    const r1 = await strategy.buildAuthorizeUrl();
    const r2 = await strategy.buildAuthorizeUrl();
    expect(r1.state).not.toBe(r2.state);
  });
});

describe('Google OAuth2 PKCE — Callback (mock token endpoint + real JWKS verify)', () => {
  it('exchanges code, verifies id_token + nonce, returns NormalizedProfile', async () => {
    const strategy = new GoogleProviderStrategy(testVerifierFactory);
    const { nonce, codeVerifier } = await strategy.buildAuthorizeUrl();

    const idToken = await signIdToken({
      iss: ISSUER, aud: CLIENT_ID, sub: 'google-sub-123',
      email: 'user@example.com', email_verified: true, name: 'Google User', nonce,
    });
    mockTokenEndpoint(idToken);

    const profile = await strategy.handleCallback({ code: 'auth-code', codeVerifier, nonce });
    expect(profile.provider).toBe('google');
    expect(profile.externalSubjectId).toBe('google-sub-123');
    expect(profile.email).toBe('user@example.com');
    expect(profile.emailVerified).toBe(true);
    expect(profile.name).toBe('Google User');
  });

  it('rejects a token with a mismatched nonce', async () => {
    const strategy = new GoogleProviderStrategy(testVerifierFactory);
    const { codeVerifier } = await strategy.buildAuthorizeUrl();
    const idToken = await signIdToken({
      iss: ISSUER, aud: CLIENT_ID, sub: 's', email: 'u@x.com', email_verified: true, nonce: 'server-nonce',
    });
    mockTokenEndpoint(idToken);
    await expect(strategy.handleCallback({ code: 'c', codeVerifier, nonce: 'different-nonce' }))
      .rejects.toThrow('invalid_nonce');
  });

  it('rejects a token with a wrong issuer', async () => {
    const strategy = new GoogleProviderStrategy(testVerifierFactory);
    const { nonce, codeVerifier } = await strategy.buildAuthorizeUrl();
    const idToken = await signIdToken({
      iss: 'https://evil.example.com', aud: CLIENT_ID, sub: 's', nonce,
    });
    mockTokenEndpoint(idToken);
    await expect(strategy.handleCallback({ code: 'c', codeVerifier, nonce }))
      .rejects.toMatchObject({ code: 'issuer_mismatch' });
  });

  it('rejects a token with a wrong audience', async () => {
    const strategy = new GoogleProviderStrategy(testVerifierFactory);
    const { nonce, codeVerifier } = await strategy.buildAuthorizeUrl();
    const idToken = await signIdToken({
      iss: ISSUER, aud: 'someone-else', sub: 's', nonce,
    });
    mockTokenEndpoint(idToken);
    await expect(strategy.handleCallback({ code: 'c', codeVerifier, nonce }))
      .rejects.toMatchObject({ code: 'audience_mismatch' });
  });

  it('surfaces email_verified=false so the JIT policy can reject linking', async () => {
    const strategy = new GoogleProviderStrategy(testVerifierFactory);
    const { nonce, codeVerifier } = await strategy.buildAuthorizeUrl();
    const idToken = await signIdToken({
      iss: ISSUER, aud: CLIENT_ID, sub: 's', email: 'u@x.com', email_verified: false, nonce,
    });
    mockTokenEndpoint(idToken);
    const profile = await strategy.handleCallback({ code: 'c', codeVerifier, nonce });
    expect(profile.emailVerified).toBe(false);
  });

  it('throws token_exchange_failed on a non-2xx token response', async () => {
    const strategy = new GoogleProviderStrategy(testVerifierFactory);
    const { nonce, codeVerifier } = await strategy.buildAuthorizeUrl();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, text: async () => 'invalid_grant' } as unknown as Response)));
    await expect(strategy.handleCallback({ code: 'c', codeVerifier, nonce }))
      .rejects.toThrow('token_exchange_failed');
  });
});
