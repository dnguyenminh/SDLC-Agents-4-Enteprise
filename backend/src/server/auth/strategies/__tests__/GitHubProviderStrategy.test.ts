/**
 * SA4E-309 — Tests for GitHubProviderStrategy (OAuth2, non-OIDC).
 * Covers: authorize URL + state, token exchange, /user vs /user/emails email
 * resolution, unverified-email rejection, and CSRF state-mismatch rejection.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitHubProviderStrategy } from '../GitHubProviderStrategy.js';

const CLIENT_ID = 'gh-client-id';
const CLIENT_SECRET = 'gh-client-secret';
const REDIRECT_URI = 'http://localhost:3000/auth/github/callback';

// Mock the config loader so no real DB is required.
vi.mock('../../utils/sso-config-loader.js', () => ({
  loadSsoProviderConfig: vi.fn(async () => ({
    providerType: 'github',
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    scopes: ['read:user', 'user:email'],
  })),
}));

/** Build a fake fetch that returns queued responses in call order. */
function fakeFetchSequence(responses: Array<Partial<Response> & { json?: () => Promise<unknown> }>) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  return fn;
}

describe('GitHubProviderStrategy', () => {
  let strategy: GitHubProviderStrategy;

  beforeEach(() => {
    strategy = new GitHubProviderStrategy();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds authorize URL with GitHub endpoint, scope and state (no PKCE/nonce)', async () => {
    const result = await strategy.buildAuthorizeUrl({ state: 'csrf-state' });
    expect(result.state).toBe('csrf-state');
    expect(result.codeVerifier).toBeUndefined();
    expect(result.nonce).toBeUndefined();

    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('scope')).toBe('read:user user:email');
    expect(url.searchParams.get('state')).toBe('csrf-state');
    expect(url.searchParams.has('code_challenge')).toBe(false);
  });

  it('generates a state when the caller does not supply one', async () => {
    const result = await strategy.buildAuthorizeUrl();
    expect(result.state.length).toBeGreaterThan(0);
  });

  it('normalizes profile using primary+verified email from /user/emails', async () => {
    // /user has null email (private) → must fall back to /user/emails.
    global.fetch = fakeFetchSequence([
      { ok: true, status: 200, json: async () => ({ access_token: 'gho_opaque' }) },
      { ok: true, status: 200, json: async () => ({ id: 4242, login: 'octocat', name: null, email: null }) },
      {
        ok: true, status: 200, json: async () => ([
          { email: 'secondary@x.com', primary: false, verified: true },
          { email: 'primary@x.com', primary: true, verified: true },
        ]),
      },
    ]) as unknown as typeof fetch;

    const profile = await strategy.handleCallback({ code: 'code-1', state: 's', storedState: { state: 's', exp: Date.now() + 60000 } });

    expect(profile.provider).toBe('github');
    expect(profile.externalSubjectId).toBe('4242'); // number id → string
    expect(profile.email).toBe('primary@x.com');
    expect(profile.emailVerified).toBe(true);
    expect(profile.name).toBe('octocat'); // name null → login
  });

  it('rejects when no verified email exists (email unverified → reject link)', async () => {
    global.fetch = fakeFetchSequence([
      { ok: true, status: 200, json: async () => ({ access_token: 'gho_opaque' }) },
      { ok: true, status: 200, json: async () => ({ id: 7, login: 'nover', name: 'No Verified', email: null }) },
      {
        ok: true, status: 200, json: async () => ([
          { email: 'unverified@x.com', primary: true, verified: false },
        ]),
      },
    ]) as unknown as typeof fetch;

    await expect(
      strategy.handleCallback({ code: 'code-1', state: 's', storedState: { state: 's', exp: Date.now() + 60000 } }),
    ).rejects.toThrow('email_not_verified');
  });

  it('rejects on CSRF state mismatch before any network call', async () => {
    const spy = vi.fn();
    global.fetch = spy as unknown as typeof fetch;

    await expect(
      strategy.handleCallback({ code: 'code-1', state: 'attacker', storedState: { state: 'legit', exp: Date.now() + 60000 } }),
    ).rejects.toThrow('invalid_state');
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws token_exchange_failed when GitHub token endpoint errors', async () => {
    global.fetch = fakeFetchSequence([
      { ok: false, status: 401, text: async () => 'bad_verification_code' } as any,
    ]) as unknown as typeof fetch;

    await expect(
      strategy.handleCallback({ code: 'bad', state: 's', storedState: { state: 's', exp: Date.now() + 60000 } }),
    ).rejects.toThrow('token_exchange_failed');
  });

  it('uses name when /user provides one', async () => {
    global.fetch = fakeFetchSequence([
      { ok: true, status: 200, json: async () => ({ access_token: 'gho_opaque' }) },
      { ok: true, status: 200, json: async () => ({ id: 9, login: 'octo', name: 'Octo Cat', email: 'octo@x.com' }) },
      { ok: true, status: 200, json: async () => ([{ email: 'octo@x.com', primary: true, verified: true }]) },
    ]) as unknown as typeof fetch;

    const profile = await strategy.handleCallback({ code: 'c', state: 's', storedState: { state: 's', exp: Date.now() + 60000 } });
    expect(profile.name).toBe('Octo Cat');
  });
});
