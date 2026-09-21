import { Hono } from 'hono';
import { getDbAdapter } from '../../../admin/db/core.js';
import { ssoStrategyRegistry } from '../../auth/strategies/index.js';

const KNOWN_PROVIDERS = ['entra', 'google', 'github', 'x', 'facebook', 'azuread'];

export function createSsoDynamicRoutes() {
  const router = new Hono();

  // Public (pre-login): list enabled SSO providers for the login page.
  // Safe fields only — never exposes client_secret/tenant_id.
  router.get('/sso/providers', async (c) => {
    try {
      const db = getDbAdapter();
      const rows = await db.allAsync<{ provider_id: string; provider_type: string; name: string; login_ui_html: string }>(
        'SELECT provider_id, provider_type, name, login_ui_html FROM sso_providers WHERE enabled = 1 ORDER BY provider_type'
      );
      return c.json({ providers: rows || [] });
    } catch {
      return c.json({ providers: [] });
    }
  });

  router.get('/:provider/login', async (c) => {
    const provider = c.req.param('provider').toLowerCase();
    const db = getDbAdapter();
    const row = await db.getAsync<{ redirect_uri: string; name: string }>(
      'SELECT redirect_uri, name FROM sso_providers WHERE provider_type = ? AND enabled = 1',
      [provider]
    );
    if (!row) return c.text('Provider not found or disabled', 404);

    const base = process.env.SSO_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const redirectUri = row.redirect_uri || `${base}/auth/${provider}/callback`;

    if (ssoStrategyRegistry.has(provider)) {
      return c.redirect(`/auth/${provider}/login?redirect_to=${encodeURIComponent(redirectUri)}`);
    }

    if (KNOWN_PROVIDERS.includes(provider)) {
      return c.json({ provider, message: 'Provider not implemented yet', config: { name: row.name, redirectUri } }, 501);
    }
    return c.text('Unknown provider', 404);
  });

  return router;
}
