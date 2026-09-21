import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EntraProviderStrategy } from '../EntraProviderStrategy.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const CLIENT_SECRET = 'secret12345';
const REDIRECT_URI = 'http://localhost:3000/auth/entra/callback';
const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

describe('EntraProviderStrategy', () => {
  let strategy: EntraProviderStrategy;

  beforeEach(() => {
    process.env.SSO_ENABLED = 'true';
    process.env.ENTRA_TENANT_ID = TENANT_ID;
    process.env.ENTRA_CLIENT_ID = CLIENT_ID;
    process.env.ENTRA_CLIENT_SECRET = CLIENT_SECRET;
    process.env.ENTRA_REDIRECT_URI = REDIRECT_URI;
    process.env.ENTRA_AUTHORITY = AUTHORITY;
    process.env.ENTRA_ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
    process.env.ENTRA_JWKS_URI = `${AUTHORITY}/discovery/v2.0/keys`;
    process.env.ENTRA_SCOPES = 'openid profile email offline_access';

    strategy = new EntraProviderStrategy();
  });

  afterEach(() => {
    delete process.env.SSO_ENABLED;
    delete process.env.ENTRA_TENANT_ID;
    delete process.env.ENTRA_CLIENT_ID;
    delete process.env.ENTRA_CLIENT_SECRET;
    delete process.env.ENTRA_REDIRECT_URI;
    delete process.env.ENTRA_AUTHORITY;
    delete process.env.ENTRA_ISSUER;
    delete process.env.ENTRA_JWKS_URI;
    delete process.env.ENTRA_SCOPES;
    vi.restoreAllMocks();
  });

  it('builds authorize URL with PKCE parameters', async () => {
    const result = await strategy.buildAuthorizeUrl({ state: 'custom-state' });
    expect(result.state).toBe('custom-state');
    expect(result.nonce).toBeDefined();
    expect(result.codeVerifier).toBeDefined();

    const parsed = new URL(result.url);
    expect(parsed.origin).toBe('https://login.microsoftonline.com');
    expect(parsed.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('state')).toBe('custom-state');
    expect(parsed.searchParams.get('nonce')).toBe(result.nonce);
  });

  it('throws error when SSO is not enabled', async () => {
    delete process.env.SSO_ENABLED;
    await expect(strategy.buildAuthorizeUrl()).rejects.toThrow('SSO not enabled');
  });

  it('handles callback successfully and returns NormalizedProfile', async () => {
    const expectedNonce = 'test-nonce-123';
    const payload = {
      iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      sub: 'sub-user-1',
      oid: 'oid-entra-456',
      email: 'entra.user@example.com',
      email_verified: true,
      name: 'Entra User',
      nonce: expectedNonce,
      groups: ['Admin'],
    };

    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const id_token = `${header}.${body}.sig`;

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id_token, access_token: 'at-123' }),
    });

    const entraAuthModule = await import('../../../middleware/verifiers/entra-auth.js');
    vi.spyOn(entraAuthModule, 'getEntraVerifierAsync').mockResolvedValue({
      verify: vi.fn().mockResolvedValue(payload),
    } as any);

    const profile = await strategy.handleCallback({
      code: 'auth-code-123',
      codeVerifier: 'verifier-123',
      nonce: expectedNonce,
    });

    expect(profile.provider).toBe('entra');
    expect(profile.externalSubjectId).toBe('oid-entra-456');
    expect(profile.email).toBe('entra.user@example.com');
    expect(profile.emailVerified).toBe(true);
    expect(profile.name).toBe('Entra User');
    expect(profile.groups).toEqual(['Admin']);
  });

  // SEC-09: email_verified may arrive as the STRING "false". Boolean("false") is
  // true, which would wrongly trust an unverified email — must resolve to false.
  it('treats string "false" email_verified as NOT verified', async () => {
    const expectedNonce = 'test-nonce-sec09';
    const payload = {
      iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      sub: 'sub-user-2',
      oid: 'oid-entra-789',
      email: 'unverified@example.com',
      email_verified: 'false',
      name: 'Unverified User',
      nonce: expectedNonce,
    };

    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const id_token = `${header}.${body}.sig`;

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id_token, access_token: 'at-123' }),
    });

    const entraAuthModule = await import('../../../middleware/verifiers/entra-auth.js');
    vi.spyOn(entraAuthModule, 'getEntraVerifierAsync').mockResolvedValue({
      verify: vi.fn().mockResolvedValue(payload),
    } as any);

    const profile = await strategy.handleCallback({
      code: 'auth-code-123',
      codeVerifier: 'verifier-123',
      nonce: expectedNonce,
    });

    expect(profile.emailVerified).toBe(false);
  });

  it('rejects callback with invalid_nonce when nonce does not match', async () => {
    const payload = {
      sub: 'sub-user-1',
      oid: 'oid-123',
      email: 'user@example.com',
      nonce: 'mismatched-nonce',
    };
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const id_token = `${header}.${body}.sig`;

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id_token, access_token: 'at-123' }),
    });

    const entraAuthModule = await import('../../../middleware/verifiers/entra-auth.js');
    vi.spyOn(entraAuthModule, 'getEntraVerifierAsync').mockResolvedValue({
      verify: vi.fn().mockResolvedValue(payload),
    } as any);

    await expect(strategy.handleCallback({
      code: 'auth-code-123',
      codeVerifier: 'verifier-123',
      nonce: 'expected-nonce',
    })).rejects.toThrow('invalid_nonce');
  });

  it('throws when token endpoint fails', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'bad_verification_code',
    });

    await expect(strategy.handleCallback({
      code: 'bad-code',
      codeVerifier: 'verifier-123',
    })).rejects.toThrow('token_exchange_failed');
  });
});
