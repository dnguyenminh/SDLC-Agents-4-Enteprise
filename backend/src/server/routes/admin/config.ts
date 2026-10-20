/**
 * admin/routes/config.ts — Configuration management and audit log endpoints.
 * SA4E-50: All admin-db calls are awaited since they are now async.
 * Facade (BR-18): effective-config assembly in config-effective.ts, LLM routes in
 * config-llm.ts, PATCH handler in config-patch.ts.
 */

import { Hono } from 'hono';
import { getConfigChanges, getAuditLogs, recordAudit } from '../../../admin/admin-db.js';
import { maskSecret } from '../../../admin/sanitize.js';
import type { AdminContext } from './context.js';
import { getEffectiveConfig } from './config-effective.js';
import { registerConfigLlmRoutes } from './config-llm.js';
import { handleConfigPatch } from './config-patch.js';

export function createConfigRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  registerConfigLlmRoutes(app, ctx);

  app.get('/api/admin/config', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    const config = await getEffectiveConfig(ctx);
    // SA4E-338 S4 (D-SEC-06): mask secrets at the response boundary — covers env, DB and
    // runtime-override sources (runtime overrides would otherwise echo the raw value).
    if (config.llm) config.llm.apiKey = maskSecret(config.llm.apiKey);
    if (config.auth) config.auth.entraClientSecret = maskSecret(config.auth.entraClientSecret);
    const history = await getConfigChanges(10);
    c.header('Cache-Control', 'no-store');
    return c.json({ config, history, restartRequired: ctx.RESTART_REQUIRED_KEYS });
  });

  app.patch('/api/admin/config/:section/:key', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    if (permCheck.roleData && (permCheck.roleData as { readOnly?: boolean }).readOnly === true) return c.json({ error: 'Forbidden: CONFIG_EDIT is read-only for this user' }, 403);
    return handleConfigPatch(c, ctx, user);
  });

  app.get('/api/admin/config/history', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    const history = await getConfigChanges(20);
    c.header('Cache-Control', 'no-store');
    return c.json({ history });
  });

  app.post('/api/admin/config/:section/reset', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    if (permCheck.roleData && (permCheck.roleData as { readOnly?: boolean }).readOnly === true) return c.json({ error: 'Forbidden: CONFIG_EDIT is read-only for this user' }, 403);
    const section = c.req.param('section');
    const config = await getEffectiveConfig(ctx);
    if (!config[section]) return c.json({ error: `Section "${section}" not found` }, 404);
    const overridesExisted = !!ctx.configOverrides[section] && Object.keys(ctx.configOverrides[section]).length > 0;
    delete ctx.configOverrides[section];
    await recordAudit(user.userId, user.username, 'CONFIG_RESET', 'config', section, JSON.stringify({ section, overridesCleared: overridesExisted }));
    return c.json({ success: true, section, config: (await getEffectiveConfig(ctx))[section] });
  });

  app.post('/api/admin/config/reset-all', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    if (permCheck.roleData && (permCheck.roleData as { readOnly?: boolean }).readOnly === true) return c.json({ error: 'Forbidden: CONFIG_EDIT is read-only for this user' }, 403);
    const sections = Object.keys(ctx.configOverrides);
    for (const key of Object.keys(ctx.configOverrides)) delete ctx.configOverrides[key];
    await recordAudit(user.userId, user.username, 'CONFIG_RESET_ALL', 'config', undefined, JSON.stringify({ sectionsCleared: sections }));
    return c.json({ success: true, config: await getEffectiveConfig(ctx) });
  });

  app.get('/api/admin/audit', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'AUDIT_VIEW');
    if (permCheck instanceof Response) return permCheck;
    const page = parseInt(c.req.query('page') || '1');
    const pageSize = parseInt(c.req.query('pageSize') || '50');
    const action = c.req.query('action') || undefined;
    const dateFrom = c.req.query('dateFrom') || undefined;
    const dateTo = c.req.query('dateTo') || undefined;
    const userId = (user as { impersonating?: boolean }).impersonating ? user.userId : undefined;
    const result = await getAuditLogs({ userId, action, dateFrom, dateTo }, page, pageSize);
    return c.json({ entries: result.items, total: result.total, page, pageSize, totalPages: Math.ceil(result.total / pageSize) });
  });

  app.get('/api/admin/taskworker/stats', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    const memory = ctx.registry?.getModule?.('memory');
    const worker = memory?.taskWorker;
    if (!worker) return c.json({ enabled: false, stats: null, message: 'TaskWorker not initialized' });
    const stats = await worker.getStats();
    const config = { concurrency: (worker as any).config?.concurrency, baseInterval: (worker as any).config?.baseInterval };
    return c.json({ enabled: true, stats, config });
  });

  /** SA4E-101: Lightweight progress endpoint for status bar polling (no permission check — read-only). */
  app.get('/api/admin/taskworker/progress', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const memory = ctx.registry?.getModule?.('memory');
    const worker = memory?.taskWorker;
    if (!worker) return c.json({ active: false });
    const progress = await worker.getProgress();
    if (!progress) return c.json({ active: false });
    return c.json({ active: true, ...progress });
  });

  app.post('/api/admin/taskworker/retry-all', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    const memory = ctx.registry?.getModule?.('memory');
    const worker = memory?.taskWorker as any;
    if (!worker?.getRepository) return c.json({ ok: false, error: 'TaskWorker not available' });
    // SA4E-338 S1 (D-SEC-02): scoped + bounded + terminal-exclusion apply here too.
    const count = await worker.getRepository().retryAllFailed({ projectScope: ctx.getRequestProjectId(c), limit: 500 });
    return c.json({ ok: true, retried: count });
  });

  return app;
}
