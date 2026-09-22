import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createSsoDynamicRoutes } from '../sso-dynamic.js';
import * as adminDbCore from '../../../../admin/db/core.js';
import { ssoStrategyRegistry } from '../../../auth/strategies/index.js';

describe('sso-dynamic routes', () => {
  let app: Hono;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      allAsync: vi.fn(),
      getAsync: vi.fn(),
      runAsync: vi.fn(),
    };
    vi.spyOn(adminDbCore, 'getDbAdapter').mockReturnValue(mockDb);

    app = new Hono();
    app.route('/auth', createSsoDynamicRoutes());
  });

  it('GET /auth/sso/providers returns enabled providers', async () => {
    mockDb.allAsync.mockResolvedValueOnce([
      { provider_id: 'p-1', provider_type: 'entra', name: 'Microsoft Entra', login_ui_html: '<button>Entra</button>' },
    ]);

    const res = await app.request('/auth/sso/providers');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.providers).toHaveLength(1);
    expect(data.providers[0].provider_type).toBe('entra');
  });

  it('GET /auth/:provider/login redirects when strategy is registered in registry', async () => {
    mockDb.getAsync.mockResolvedValueOnce({
      redirect_uri: 'http://localhost:3000/auth/entra/callback',
      name: 'Microsoft Entra',
    });

    const res = await app.request('/auth/entra/login');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      '/auth/entra/login?redirect_to=' + encodeURIComponent('http://localhost:3000/auth/entra/callback')
    );
  });

  // SA4E-308/309: google + github are now registered in ssoStrategyRegistry,
  // so /auth/:provider/login must redirect (302) to the generic strategy route
  // instead of returning the old 501 "not implemented" placeholder.
  it('GET /auth/:provider/login redirects (302) for a registered strategy (google)', async () => {
    mockDb.getAsync.mockResolvedValueOnce({
      redirect_uri: 'http://localhost:3000/auth/google/callback',
      name: 'Google',
    });

    const res = await app.request('/auth/google/login');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      '/auth/google/login?redirect_to=' + encodeURIComponent('http://localhost:3000/auth/google/callback')
    );
  });

  it('GET /auth/:provider/login redirects (302) for a registered strategy (github)', async () => {
    mockDb.getAsync.mockResolvedValueOnce({
      redirect_uri: 'http://localhost:3000/auth/github/callback',
      name: 'GitHub',
    });

    const res = await app.request('/auth/github/login');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      '/auth/github/login?redirect_to=' + encodeURIComponent('http://localhost:3000/auth/github/callback')
    );
  });

  // Covers the 501 branch: a KNOWN provider that is NOT yet registered in the
  // strategy registry (facebook is in KNOWN_PROVIDERS but has no strategy).
  it('GET /auth/:provider/login returns 501 for known but unregistered strategy (facebook)', async () => {
    mockDb.getAsync.mockResolvedValueOnce({
      redirect_uri: 'http://localhost:3000/auth/facebook/callback',
      name: 'Facebook',
    });

    const res = await app.request('/auth/facebook/login');
    expect(res.status).toBe(501);
    const data = await res.json();
    expect(data.provider).toBe('facebook');
    expect(data.message).toBe('Provider not implemented yet');
  });

  it('GET /auth/:provider/login returns 404 if provider not enabled in DB', async () => {
    mockDb.getAsync.mockResolvedValueOnce(undefined);

    const res = await app.request('/auth/entra/login');
    expect(res.status).toBe(404);
  });

  it('GET /auth/:provider/login returns 404 for unknown provider type', async () => {
    mockDb.getAsync.mockResolvedValueOnce({
      redirect_uri: 'http://localhost:3000/auth/unknown/callback',
      name: 'Unknown Provider',
    });

    const res = await app.request('/auth/unsupported/login');
    expect(res.status).toBe(404);
  });
});
