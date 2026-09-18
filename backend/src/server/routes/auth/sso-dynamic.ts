import { Hono } from 'hono';
import { getAdminDb } from '../../admin/admin-db.js';

export function createSsoDynamicRoutes() {
  const router = new Hono();

router.get('/:provider/login', async (c) => {
  const provider = c.req.param('provider');
  const db = getAdminDb();
  const row = await db.getAsync('SELECT * FROM sso_providers WHERE provider_type = ? AND enabled = 1', [provider]);
  if (!row) return c.text('Provider not found or disabled', 404);
  const base = process.env.SSO_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const redirectUri = row.redirect_uri || `${base}/auth/${provider}/callback`;
  switch (provider) {
    case 'entra':
      return c.redirect(`/auth/entra/login?redirect_uri=${encodeURIComponent(redirectUri)}`);
    case 'google':
    case 'github':
    case 'x':
    case 'facebook':
    case 'azuread':
      return c.json({ provider, message: 'Provider not implemented yet', config: { name: row.name, redirectUri } }, 501);
    default:
      return c.text('Unknown provider', 404);
  }
});

  return router;
}
