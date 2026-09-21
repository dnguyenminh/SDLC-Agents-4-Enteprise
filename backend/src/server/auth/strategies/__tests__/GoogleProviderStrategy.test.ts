/**
 * SA4E-308 — Unit tests for GoogleProviderStrategy.
 * Focus: authorize URL (PKCE S256), profile normalization (sub→externalSubjectId,
 * email, email_verified, name), nonce binding, token-exchange + config errors.
 * Config is mocked so no DB is required; the id_token verifier is injected.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const CLIENT_ID = 'google-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'google-secret-123';
const REDIRECT_URI = 'http://localhost:3000/auth/google/callback';

// Mock the config loader — the strategy must not touch the DB in unit tests.
const loadGoogleConfigMock = vi.fn();
vi.mock('../GoogleProviderConfig.js', () => ({
  loadGoogleConfig: () => loadGoogleConfigMock(),
  GoogleConfigError: class GoogleConfigError extends Error {},
}));

// Import AFTER the mock is registered.
const { GoogleProviderStrategy } = await import('../GoogleProviderStrategy.js');
const { decodeJwtPayload } = await import('../../utils/pkce-helper.js');

/** Build an unsigned JWT (header.payload.sig) — only the payload matters for nonce. */
function makeIdToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

describe('GoogleProviderStrategy', () => {
  beforeEach(() => {
    loadGoogleConfigMock.mockResolvedValue({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: REDIRECT_URI,
      scopes: ['openid', 'email', 'profile'],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('builds authorize URL with Google endpoint and PKCE S256 params', async () => {
    const strategy = new GoogleProviderStrategy();
    const result = await strategy.buildAuthorizeUrl({ state: 'my-state' });

    expect(result.state).toBe('my-state');
    expect(result.nonce).toBeTruthy();
    expect(result.codeVerifier).toBeTruthy();

    const url = new URL(result.url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.pathname).toBe('/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('my-state');
    expect(url.searchParams.get('nonce')).toBe(result.nonce);
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
  });

  it('generates a random state + fresh challenge when none provided', async () => {
    const strategy = new GoogleProviderStrategy();
    const r1 = await strategy.buildAuthorizeUrl();
    const r2 = await strategy.buildAuthorizeUrl();
    expect(r1.state).toBeTruthy();
    expect(r1.state).not.toBe(r2.state);
    expect(new URL(r1.url).searchParams.get('code_challenge'))
      .not.toBe(new URL(r2.url).searchParams.get('code_challenge'));
  });

  it('normalizes verified Google claims into a NormalizedProfile', async () => {
    const nonce = 'nonce-abc';
    const idToken = makeIdToken({ nonce });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id_token: idToken, access_token: 'at' }),
    }));

    const verify = vi.fn().mockResolvedValue({
      sub: 'google-sub-999', email: 'jane@example.com', email_verified: true, name: 'Jane Doe',
    });
    const strategy = new GoogleProviderStrategy(() => ({ verify }));

    const profile = await strategy.handleCallback({ code: 'code-1', codeVerifier: 'v1', nonce });

    expect(profile.provider).toBe('google');
    expect(profile.externalSubjectId).toBe('google-sub-999');
    expect(profile.email).toBe('jane@example.com');
    expect(profile.emailVerified).toBe(true);
    expect(profile.name).toBe('Jane Doe');
  });

  it('treats email_verified string "true" as verified and missing as false', async () => {
    const nonce = 'n2';
    const idToken = makeIdToken({ nonce });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id_token: idToken }),
    }));

    const verify = vi.fn().mockResolvedValue({ sub: 's', email: 'e@x.com', email_verified: 'true' });
    let profile = await new GoogleProviderStrategy(() => ({ verify })).handleCallback({
      code: 'c', codeVerifier: 'v', nonce,
    });
    expect(profile.emailVerified).toBe(true);

    const verify2 = vi.fn().mockResolvedValue({ sub: 's', email: 'e@x.com' });
    profile = await new GoogleProviderStrategy(() => ({ verify: verify2 })).handleCallback({
      code: 'c', codeVerifier: 'v', nonce,
    });
    expect(profile.emailVerified).toBe(false);
  });

  it('rejects callback when nonce does not match', async () => {
    const idToken = makeIdToken({ nonce: 'server-nonce' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id_token: idToken }),
    }));
    const verify = vi.fn().mockResolvedValue({ sub: 's', email: 'e@x.com', email_verified: true });
    const strategy = new GoogleProviderStrategy(() => ({ verify }));

    await expect(strategy.handleCallback({ code: 'c', codeVerifier: 'v', nonce: 'client-nonce' }))
      .rejects.toThrow('invalid_nonce');
  });

  it('throws token_exchange_failed when the token endpoint returns non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, text: async () => 'invalid_grant',
    }));
    const strategy = new GoogleProviderStrategy(() => ({ verify: vi.fn() }));

    await expect(strategy.handleCallback({ code: 'bad', codeVerifier: 'v', nonce: 'n' }))
      .rejects.toThrow('token_exchange_failed');
  });

  it('throws token_exchange_failed when the token response is malformed (no id_token)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ access_token: 'only-access' }),
    }));
    const strategy = new GoogleProviderStrategy(() => ({ verify: vi.fn() }));

    await expect(strategy.handleCallback({ code: 'c', codeVerifier: 'v', nonce: 'n' }))
      .rejects.toThrow('token_exchange_failed');
  });

  it('sends code_verifier in the token exchange request body', async () => {
    const nonce = 'n3';
    const idToken = makeIdToken({ nonce });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id_token: idToken }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const verify = vi.fn().mockResolvedValue({ sub: 's', email: 'e@x.com', email_verified: true });

    await new GoogleProviderStrategy(() => ({ verify })).handleCallback({
      code: 'code-xyz', codeVerifier: 'verifier-xyz', nonce,
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(init.body);
    expect(body.get('code_verifier')).toBe('verifier-xyz');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('code-xyz');
    // sanity: our helper decodes the token nonce we expect
    expect(decodeJwtPayload(idToken)?.nonce).toBe(nonce);
  });
});
