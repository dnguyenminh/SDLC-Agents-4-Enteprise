import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntraProviderStrategy } from '../EntraProviderStrategy.js';
import { ssoStrategyRegistry } from '../SsoStrategyRegistry.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const CLIENT_SECRET = 'secret12345';
const REDIRECT_URI = 'http://localhost:3000/auth/entra/callback';
const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

describe('EntraProviderStrategy — Callback State Round-Trip', () => {
  afterEach(() => {
    ssoStrategyRegistry.clear();
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
  });

  it('accepts callback with state and storedState', async () => {
    const strategy = new EntraProviderStrategy();
    ssoStrategyRegistry.register(strategy);

    const expectedNonce = 'test-nonce-123';
    const payload = {
      iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      sub: 'sub-user-1',
      oid: 'oid-entra-456',
      email: 'entra.user@example.com',
      email_verified: true,
      name: 'Entra User',
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
      state: 'stored-state',
      storedState: { nonce: expectedNonce, codeVerifier: 'verifier-123', exp: Date.now() + 60000 },
      codeVerifier: 'verifier-123',
      nonce: expectedNonce,
    });

    expect(profile.provider).toBe('entra');
    expect(profile.externalSubjectId).toBe('oid-entra-456');
    expect(profile.email).toBe('entra.user@example.com');
    expect(profile.emailVerified).toBe(true);
  });
});
