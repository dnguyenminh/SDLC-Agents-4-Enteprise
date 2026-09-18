import { Hono } from 'hono';
import { getAdminDb } from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';

export function createSsoProvidersRoutes(ctx: AdminContext) {
  const router = new Hono<{ Bindings: { Variables: AdminContext } }>();

router.get('/', async (c) => {
  const db = getAdminDb();
  const rows = await db.allAsync('SELECT provider_id, provider_type, name, enabled, client_id, client_secret, tenant_id, redirect_uri, allowed_redirects, scopes, login_ui_html, created_at, updated_at FROM sso_providers ORDER BY provider_type');
  return c.json({ providers: rows });
});

router.post('/', async (c) => {
  const payload = await c.req.json();
  const { provider_type, name, enabled = false, client_id = '', client_secret = '', tenant_id = '', redirect_uri = '', allowed_redirects = '', scopes = '', login_ui_html = '' } = payload;
  if (!provider_type || !name) return c.json({ error: 'provider_type and name required' }, 400);
  const db = getAdminDb();
  const provider_id = `${provider_type}-${Date.now()}`;
  const now = new Date().toISOString();
  await db.runAsync(`INSERT INTO sso_providers (provider_id, provider_type, name, enabled, client_id, client_secret, tenant_id, redirect_uri, allowed_redirects, scopes, login_ui_html, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [provider_id, provider_type, name, enabled ? 1 : 0, client_id, client_secret, tenant_id, redirect_uri, allowed_redirects, scopes, login_ui_html, now, now]);
  return c.json({ provider_id });
});

router.put('/:id', async (c) => {
  const id = c.req.param('id');
  const payload = await c.req.json();
  const db = getAdminDb();
  const now = new Date().toISOString();
  const fields = [];
  const vals = [];
  for (const k of ['name','enabled','client_id','client_secret','tenant_id','redirect_uri','allowed_redirects','scopes','login_ui_html']) {
    if (k in payload) { fields.push(`${k}=?`); vals.push(k==='enabled' ? (payload[k] ? 1 : 0) : payload[k]); }
  }
  if (fields.length===0) return c.json({ error: 'no fields' }, 400);
  fields.push('updated_at=?'); vals.push(now); vals.push(id);
  await db.runAsync(`UPDATE sso_providers SET ${fields.join(',')} WHERE provider_id=?`, vals);
  return c.json({ ok: true });
});

router.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getAdminDb();
  await db.runAsync('DELETE FROM sso_providers WHERE provider_id=?', [id]);
  return c.json({ ok: true });
});

  return router;
}
