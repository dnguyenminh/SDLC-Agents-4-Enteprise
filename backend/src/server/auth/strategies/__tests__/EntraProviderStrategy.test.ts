import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EntraProviderStrategy } from '../EntraProviderStrategy.js';
import {
  TENANT_ID,
  CLIENT_ID,
  setupEntraEnv,
  teardownEntraEnv,
  makeIdToken,
} from './EntraProviderStrategy.helpers.js';

describe('EntraProviderStrategy', () => {
  let strategy: EntraProviderStrategy;

  beforeEach(() => {
    setupEntraEnv();
    strategy = new EntraProviderStrategy();
  });

  afterEach(() => {
    teardownEntraEnv();
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

  // Root-cause fix: Entra ID does NOT emit standard `email_verified`. Its
  // documented equivalent is `xms_edov` (email domain owner verified). A tenant
  // account with xms_edov=true and no email_verified MUST be treated verified,
  // so JIT provisioning succeeds instead of failing with internal_error.
  it('treats xms_edov=true (no email_verified) as verified — Entra tenant account', async () => {
    const expectedNonce = 'nonce-edov';
    const payload = {
      iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      sub: 'sub-edov',
      oid: 'oid-edov-1',
      email: 'tenant.user@contoso.com',
      xms_edov: true,
      name: 'Tenant User',
      nonce: expectedNonce,
    };
    const id_token = makeIdToken(payload);

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ id_token, access_token: 'at' }),
    });
    const entraAuthModule = await import('../../../middleware/verifiers/entra-auth.js');
    vi.spyOn(entraAuthModule, 'getEntraVerifierAsync').mockResolvedValue({
      verify: vi.fn().mockResolvedValue(payload),
    } as any);

    const profile = await strategy.handleCallback({
      code: 'code', codeVerifier: 'v', nonce: expectedNonce,
    });
    expect(profile.emailVerified).toBe(true);
    expect(profile.email).toBe('tenant.user@contoso.com');
  });
});
