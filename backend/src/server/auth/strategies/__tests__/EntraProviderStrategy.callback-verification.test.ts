/**
 * EntraProviderStrategy — callback verification tests (xms_edov, fallback
 * email, invalid nonce, token endpoint failure).
 * Split from EntraProviderStrategy.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — tests only relocated.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EntraProviderStrategy } from '../EntraProviderStrategy.js';
import {
  TENANT_ID,
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

  // xms_edov as the string "false" must NOT be trusted (Boolean("false")===true trap).
  it('treats xms_edov="false" as NOT verified', async () => {
    const expectedNonce = 'nonce-edov-false';
    const payload = {
      iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      sub: 'sub-edov-2', oid: 'oid-edov-2', email: 'u@contoso.com',
      xms_edov: 'false', nonce: expectedNonce,
    };
    const id_token = makeIdToken(payload);
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ id_token, access_token: 'at' }),
    });
    const entraAuthModule = await import('../../../middleware/verifiers/entra-auth.js');
    vi.spyOn(entraAuthModule, 'getEntraVerifierAsync').mockResolvedValue({
      verify: vi.fn().mockResolvedValue(payload),
    } as any);

    const profile = await strategy.handleCallback({ code: 'c', codeVerifier: 'v', nonce: expectedNonce });
    expect(profile.emailVerified).toBe(false);
  });

  // When `email` claim is absent, fall back to preferred_username so JIT has an address.
  it('falls back to preferred_username when email claim is absent', async () => {
    const expectedNonce = 'nonce-fallback';
    const verifyClaims = { sub: 'sub-x', oid: 'oid-x', name: 'X' }; // no email from verify()
    const payload = {
      iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      sub: 'sub-x', oid: 'oid-x',
      preferred_username: 'fallback.user@contoso.com',
      xms_edov: true, nonce: expectedNonce,
    };
    const id_token = makeIdToken(payload);
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ id_token, access_token: 'at' }),
    });
    const entraAuthModule = await import('../../../middleware/verifiers/entra-auth.js');
    vi.spyOn(entraAuthModule, 'getEntraVerifierAsync').mockResolvedValue({
      verify: vi.fn().mockResolvedValue(verifyClaims),
    } as any);

    const profile = await strategy.handleCallback({ code: 'c', codeVerifier: 'v', nonce: expectedNonce });
    expect(profile.email).toBe('fallback.user@contoso.com');
    expect(profile.emailVerified).toBe(true);
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
