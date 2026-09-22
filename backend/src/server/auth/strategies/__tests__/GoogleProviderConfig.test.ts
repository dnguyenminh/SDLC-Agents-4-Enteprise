/**
 * SA4E-308 — Unit tests for loadGoogleConfig.
 * Config MUST come from the sso_providers table (provider_type='google', enabled=1),
 * never from env. Missing rows or empty required fields produce a clear error.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the admin-db barrel that GoogleProviderConfig dynamically imports.
const getAsyncMock = vi.fn();
vi.mock('../../../../admin/admin-db.js', () => ({
  getAdminDb: () => ({ getAsync: getAsyncMock }),
}));

const { loadGoogleConfig, GoogleConfigError } = await import('../GoogleProviderConfig.js');

describe('loadGoogleConfig', () => {
  beforeEach(() => getAsyncMock.mockReset());

  it('maps a fully configured google row to GoogleConfig', async () => {
    getAsyncMock.mockResolvedValue({
      client_id: 'cid', client_secret: 'secret', redirect_uri: 'https://app/cb', scopes: 'openid email profile',
    });
    const cfg = await loadGoogleConfig();
    expect(cfg).toEqual({
      clientId: 'cid', clientSecret: 'secret', redirectUri: 'https://app/cb',
      scopes: ['openid', 'email', 'profile'],
    });
  });

  it('defaults scopes to openid/email/profile when the column is empty', async () => {
    getAsyncMock.mockResolvedValue({
      client_id: 'cid', client_secret: 'secret', redirect_uri: 'https://app/cb', scopes: '',
    });
    const cfg = await loadGoogleConfig();
    expect(cfg.scopes).toEqual(['openid', 'email', 'profile']);
  });

  it('queries provider_type=google and enabled=1', async () => {
    getAsyncMock.mockResolvedValue({
      client_id: 'c', client_secret: 's', redirect_uri: 'r', scopes: '',
    });
    await loadGoogleConfig();
    const [sql, args] = getAsyncMock.mock.calls[0];
    expect(sql).toContain("provider_type = ?");
    expect(sql).toContain('enabled = 1');
    expect(args).toEqual(['google']);
  });

  it('throws when no enabled google provider exists', async () => {
    getAsyncMock.mockResolvedValue(undefined);
    await expect(loadGoogleConfig()).rejects.toBeInstanceOf(GoogleConfigError);
    await expect(loadGoogleConfig()).rejects.toThrow(/no enabled google provider/);
  });

  it('throws a specific error when client_id is empty', async () => {
    getAsyncMock.mockResolvedValue({
      client_id: '  ', client_secret: 's', redirect_uri: 'r', scopes: '',
    });
    await expect(loadGoogleConfig()).rejects.toThrow(/client_id/);
  });

  it('throws a specific error when client_secret is empty', async () => {
    getAsyncMock.mockResolvedValue({
      client_id: 'c', client_secret: '', redirect_uri: 'r', scopes: '',
    });
    await expect(loadGoogleConfig()).rejects.toThrow(/client_secret/);
  });
});
