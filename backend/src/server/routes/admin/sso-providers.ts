import { Hono } from 'hono';
import { getAdminDb } from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';

const SSO_PROVIDER_TYPES = ['entra', 'google', 'github', 'x', 'facebook', 'azuread'];

/** Mask a secret value for API responses — never return plaintext secrets. */
function maskSecret(v: unknown): string {
  return typeof v === 'string' && v.length > 0 ? '***' : '';
}

export function createSsoProvidersRoutes(ctx: AdminContext) {
  const router = new Hono();

  router.get('/', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    try {
      const db = getAdminDb();
      const rows = await db.allAsync('SELECT provider_id, provider_type, name, enabled, client_id, client_secret, tenant_id, redirect_uri, allowed_redirects, scopes, login_ui_html, created_at, updated_at FROM sso_providers ORDER BY provider_type');
      const providers = (rows || []).map((r: Record<string, unknown>) => ({ ...r, client_secret: maskSecret(r.client_secret) }));
      return c.json({ providers });
    } catch (err) {
      ctx.logger.error({ err, context: 'sso-providers-list' }, 'Failed to list SSO providers');
      return c.json({ providers: [], __error: 'Failed to list SSO providers' }, 500);
    }
  });

  router.post('/', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    try {
      const payload = await c.req.json();
      const { provider_type, name, enabled = false, client_id = '', client_secret = '', tenant_id = '', redirect_uri = '', allowed_redirects = '', scopes = '', login_ui_html = '' } = payload;
      if (!provider_type || !name) return c.json({ error: 'provider_type and name required' }, 400);
      if (!SSO_PROVIDER_TYPES.includes(provider_type)) return c.json({ error: `provider_type must be one of: ${SSO_PROVIDER_TYPES.join(', ')}` }, 400);
      const db = getAdminDb();
      const exists = await db.getAsync('SELECT 1 FROM sso_providers WHERE provider_type = ?', [provider_type]);
      if (exists) return c.json({ error: `Provider type '${provider_type}' already exists` }, 409);
      const provider_id = `${provider_type}-${Date.now()}`;
      const now = new Date().toISOString();
      await db.runAsync(`INSERT INTO sso_providers (provider_id, provider_type, name, enabled, client_id, client_secret, tenant_id, redirect_uri, allowed_redirects, scopes, login_ui_html, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [provider_id, provider_type, name, enabled ? 1 : 0, client_id, client_secret, tenant_id, redirect_uri, allowed_redirects, scopes, login_ui_html, now, now]);
      return c.json({ provider_id });
    } catch (err) {
      ctx.logger.error({ err, context: 'sso-providers-create' }, 'Failed to create SSO provider');
      return c.json({ error: 'Failed to create SSO provider' }, 500);
    }
  });

  router.put('/:id', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    try {
      const id = c.req.param('id');
      const payload = await c.req.json();
      const db = getAdminDb();
      const now = new Date().toISOString();
      const fields: string[] = [];
      const vals: unknown[] = [];
      for (const k of ['name', 'enabled', 'client_id', 'client_secret', 'tenant_id', 'redirect_uri', 'allowed_redirects', 'scopes', 'login_ui_html']) {
        if (k in payload) {
          // Never overwrite a stored secret with the masked placeholder
          if (k === 'client_secret' && payload[k] === '***') continue;
          fields.push(`${k}=?`);
          vals.push(k === 'enabled' ? (payload[k] ? 1 : 0) : payload[k]);
        }
      }
      if (fields.length === 0) return c.json({ error: 'no fields to update' }, 400);
      fields.push('updated_at=?'); vals.push(now); vals.push(id);
      await db.runAsync(`UPDATE sso_providers SET ${fields.join(',')} WHERE provider_id=?`, vals);
      return c.json({ ok: true });
    } catch (err) {
      ctx.logger.error({ err, context: 'sso-providers-update' }, 'Failed to update SSO provider');
      return c.json({ error: 'Failed to update SSO provider' }, 500);
    }
  });

  router.delete('/:id', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    try {
      const id = c.req.param('id');
      const db = getAdminDb();
      await db.runAsync('DELETE FROM sso_providers WHERE provider_id=?', [id]);
      return c.json({ ok: true });
    } catch (err) {
      ctx.logger.error({ err, context: 'sso-providers-delete' }, 'Failed to delete SSO provider');
      return c.json({ error: 'Failed to delete SSO provider' }, 500);
    }
  });

  return router;
}
