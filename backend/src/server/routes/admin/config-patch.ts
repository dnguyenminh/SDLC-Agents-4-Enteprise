/** PATCH /api/admin/config/:section/:key handler (BR-18 extraction from config.ts). */
import type { Context } from 'hono';
import { recordConfigChange, recordAudit } from '../../../admin/admin-db.js';
import { maskSecret, isSecretConfigKey } from '../../../admin/sanitize.js';
import type { AdminContext } from './context.js';
import { bus, Events } from '../../../shared/EventBus.js';
import { authRuntimeOverrides } from '../../../config/EntraConfig.js';
import { getEffectiveConfig } from './config-effective.js';

interface AuthedUser { userId: string; username: string }

export async function handleConfigPatch(c: Context, ctx: AdminContext, user: AuthedUser): Promise<Response> {
  const section = c.req.param('section') as string;
  const key = c.req.param('key') as string;
  const { value } = await c.req.json();
  if (value === undefined || value === null) return c.json({ error: 'value is required' }, 400);
  const config = await getEffectiveConfig(ctx);
  if (!config[section]) return c.json({ error: `Section "${section}" not found` }, 404);
  if (!(key in config[section])) return c.json({ error: `Key "${key}" not found in section "${section}"` }, 404);
  const invalid = validateAuthKey(section, key, value, c);
  if (invalid) return invalid;
  const oldValue = JSON.stringify(config[section][key]);
  const newValue = typeof value === 'string' ? value : JSON.stringify(value);
  const requiresRestart = (ctx.RESTART_REQUIRED_KEYS[section] || []).includes(key);
  // SA4E-338 S4 (D-SEC-06): audit entries never carry secrets in plaintext.
  const secret = isSecretConfigKey(section, key);
  if (!ctx.configOverrides[section]) ctx.configOverrides[section] = {};
  ctx.configOverrides[section][key] = value;
  await recordConfigChange(section, key, oldValue, newValue, user.username, requiresRestart);
  await recordAudit(user.userId, user.username, 'CONFIG_CHANGE', 'config', `${section}.${key}`, JSON.stringify({
    oldValue: secret ? maskSecret(oldValue) : oldValue,
    newValue: secret ? maskSecret(newValue) : newValue,
    requiresRestart,
  }));
  await emitSectionEvents(section, key, value);
  // Echo never returns a submitted secret in plaintext (D-SEC-06).
  return c.json({ success: true, requiresRestart, section, key, value: secret ? maskSecret(newValue) : value });
}

/** Validate auth section keys (GUID / URL shapes) — returns 400 response or null. */
function validateAuthKey(section: string, key: string, value: unknown, c: Context): Response | null {
  if (section !== 'auth') return null;
  if (key === 'ssoEnabled') {
    if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
      return c.json({ error: 'ssoEnabled must be true/false' }, 400);
    }
  }
  if (key === 'entraTenantId' || key === 'entraClientId') {
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(value))) {
      return c.json({ error: `${key} must be a valid GUID` }, 400);
    }
  }
  if (key === 'entraRedirectUri') {
    try { new URL(String(value)); } catch { return c.json({ error: 'entraRedirectUri must be a valid URL' }, 400); }
  }
  if (key === 'ssoAllowedRedirects') {
    const parts = String(value).split(',').map(s => s.trim()).filter(Boolean);
    for (const p of parts) { try { new URL(p); } catch { return c.json({ error: `ssoAllowedRedirects contains invalid URL: ${p}` }, 400); } }
  }
  return null;
}

/** Notify runtime consumers about the changed section (hot-reload, no restart). */
async function emitSectionEvents(section: string, key: string, value: unknown): Promise<void> {
  // If LLM config changed, notify MemoryModule to re-init LLM services immediately (no restart needed)
  if (section === 'llm') {
    await bus.emit(Events.LLM_CONFIG_CHANGED, { section, key, value });
  }
  // If TaskWorker config changed, notify TaskWorker to apply new settings immediately
  if (section === 'taskWorker') {
    await bus.emit(Events.TASK_WORKER_CONFIG_CHANGED, { section, key, value });
  }
  // If rate-limit config changed, hot-reload the middleware cap (no restart)
  if (section === 'rateLimit') {
    await bus.emit(Events.RATE_LIMIT_CONFIG_CHANGED, { section, key, value });
  }
  // If index-limit config changed, hot-reload the index concurrency cap (no restart)
  if (section === 'indexLimit') {
    await bus.emit(Events.INDEX_LIMIT_CONFIG_CHANGED, { section, key, value });
  }
  // If auth config changed, hot-reload Entra verifier config
  if (section === 'auth') {
    const envKeyMap: Record<string, string> = {
      ssoEnabled: 'SSO_ENABLED',
      entraTenantId: 'ENTRA_TENANT_ID',
      entraClientId: 'ENTRA_CLIENT_ID',
      entraClientSecret: 'ENTRA_CLIENT_SECRET',
      entraRedirectUri: 'ENTRA_REDIRECT_URI',
      ssoAllowedRedirects: 'SSO_ALLOWED_REDIRECTS',
    };
    const envKey = envKeyMap[key];
    if (envKey) {
      authRuntimeOverrides.set(envKey, String(value));
    }
    await bus.emit(Events.AUTH_CONFIG_CHANGED, { section, key, value });
  }
}
