/**
 * admin/routes/config.ts — Configuration management and audit log endpoints.
 * SA4E-50: All admin-db calls are awaited since they are now async.
 */

import { Hono } from 'hono';
import { loadConfig } from '../../../config/index.js';
import { validateExternalUrl } from '../../middleware/url-validator.js';
import { getConfigChanges, recordConfigChange, recordAudit, getAuditLogs, loadPersistedLLMConfig, getLatestConfigValue } from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';
import { bus, Events } from '../../../shared/EventBus.js';

async function getEffectiveConfig(ctx: AdminContext): Promise<Record<string, Record<string, any>>> {
  const cfg = loadConfig();
  const base: Record<string, Record<string, any>> = {
    server: { port: cfg.port, host: cfg.host, logLevel: cfg.logLevel },
    embedding: { model: 'paraphrase-multilingual-MiniLM-L12-v2', dimensions: 384, onnxModelPath: cfg.onnxModelPath },
    llm: {
      provider: process.env.LLM_PROVIDER || 'ollama',
      model: process.env.LLM_MODEL || 'qwen2.5:7b-instruct-q4_K_M',
      baseUrl: process.env.LLM_BASE_URL || 'http://localhost:11434',
      apiKey: process.env.LLM_API_KEY ? '***' : '',
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '800', 10),
      tagAnalysisEnabled: process.env.TAG_ANALYSIS_ENABLED !== 'false',
      tagConfidenceThreshold: parseFloat(process.env.TAG_CONFIDENCE_THRESHOLD || '0.7'),
    },
    kb: { maxEntries: 100000, sqliteDbPath: cfg.sqliteDbPath, dataDir: cfg.dataDir },
    mcp: { orchestrationConfigPath: cfg.orchestrationConfigPath },
    taskWorker: {
      concurrency: parseInt(process.env.TASK_WORKER_CONCURRENCY || '2', 10),
      baseInterval: parseInt(process.env.TASK_WORKER_BASE_INTERVAL || '2000', 10),
      maxInterval: parseInt(process.env.TASK_WORKER_MAX_INTERVAL || '30000', 10),
    },
  };

  // Merge DB-persisted LLM config on top of env defaults (Admin UI changes)
  try {
    const llmOverrides = await loadPersistedLLMConfig();
    if (llmOverrides.provider) base.llm.provider = llmOverrides.provider;
    if (llmOverrides.model) base.llm.model = llmOverrides.model;
    if (llmOverrides.baseUrl) base.llm.baseUrl = llmOverrides.baseUrl;
    if (llmOverrides.apiKey && llmOverrides.apiKey !== '***') base.llm.apiKey = llmOverrides.apiKey;
    if (llmOverrides.temperature !== undefined) base.llm.temperature = llmOverrides.temperature;
    if (llmOverrides.maxTokens !== undefined) base.llm.maxTokens = llmOverrides.maxTokens;
    if (llmOverrides.tagAnalysisEnabled !== undefined) base.llm.tagAnalysisEnabled = llmOverrides.tagAnalysisEnabled;
    if (llmOverrides.tagConfidenceThreshold !== undefined) base.llm.tagConfidenceThreshold = llmOverrides.tagConfidenceThreshold;
  } catch { /* DB not ready — use env defaults */ }

  // Merge DB-persisted taskWorker config
  try {
    const twKeys = ['concurrency', 'baseInterval', 'maxInterval'] as const;
    for (const key of twKeys) {
      const val = await getLatestConfigValue('taskWorker', key);
      if (val !== undefined) {
        const n = parseInt(val, 10);
        if (!isNaN(n)) base.taskWorker[key] = n;
      }
    }
  } catch { /* DB not ready — use env defaults */ }

  // Runtime in-memory overrides (from PATCH calls in current session) always win
  for (const [section, keys] of Object.entries(ctx.configOverrides)) {
    if (!base[section]) base[section] = {};
    for (const [key, val] of Object.entries(keys)) base[section][key] = val;
  }
  return base;
}

export function createConfigRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.get('/api/admin/llm/models', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    // SEC: LLM model listing triggers outbound HTTP — require CONFIG_EDIT
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    const config = await getEffectiveConfig(ctx);
    const llm = config.llm || {};
    const prov = c.req.query('provider') || llm.provider || 'ollama';
    const base = c.req.query('baseUrl') || llm.baseUrl || 'http://localhost:11434';
    try {
      const url = prov === 'ollama' ? base + '/api/tags' : base + '/models';
      const headers: Record<string, string> = {};
      const apiKey = llm.apiKey;
      if (apiKey && apiKey !== '***') { headers['Authorization'] = 'Bearer ' + apiKey; headers['x-api-key'] = apiKey; }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeout);
      if (!r.ok) return c.json({ error: 'HTTP ' + r.status, models: [] });
      const d = await r.json() as Record<string, unknown>;
      let models: { id: string; name: string }[];
      if (prov === 'ollama') models = ((d.models as { name?: string; model?: string }[] || [])).map((m: any) => ({ id: m.name || m.model || '', name: m.name || m.model || '' }));
      else models = ((d.data as { id?: string }[] || [])).map((m: any) => ({ id: m.id || '', name: m.id || '' }));
      return c.json({ models, provider: prov });
    } catch (e: any) { return c.json({ error: e.message || 'Connection failed', models: [] }); }
  });

  app.post('/api/admin/llm/test', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    // SEC: LLM test makes outbound HTTP (SSRF risk) — require CONFIG_EDIT
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    const config = await getEffectiveConfig(ctx);
    const llm = config.llm || {};
    const prov = llm.provider || 'ollama';
    const base = llm.baseUrl || 'http://localhost:11434';
    const isLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(base);
    if (llm.baseUrl && llm.baseUrl !== 'http://localhost:11434' && !isLocalUrl) {
      const urlCheck = validateExternalUrl(base);
      if (!urlCheck.valid) return c.json({ success: false, message: `SSRF blocked: ${urlCheck.error}` }, 400);
    }
    try {
      const start = Date.now();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (llm.apiKey && llm.apiKey !== '***') { headers['Authorization'] = 'Bearer ' + llm.apiKey; headers['x-api-key'] = llm.apiKey; }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const r = prov === 'ollama'
        ? await fetch(base + '/api/generate', { method: 'POST', headers, signal: controller.signal, body: JSON.stringify({ model: llm.model || 'llama3.1', prompt: 'Say hello in 5 words', stream: false, options: { num_predict: 20 } }) })
        : await fetch(base + '/models', { headers, signal: controller.signal });
      clearTimeout(timeout);
      const ms = Date.now() - start;
      if (r.ok) {
        const d = await r.json() as Record<string, unknown>;
        const info = prov === 'ollama' ? ((d.response as string || '').substring(0, 80)) : ((d.data as unknown[] || []).length + ' models available');
        return c.json({ success: true, message: `Connected (${ms}ms) — ${info}`, latencyMs: ms });
      } else return c.json({ success: false, message: 'HTTP ' + r.status, latencyMs: ms });
    } catch (e: any) { return c.json({ success: false, message: e.message || 'Connection failed' }); }
  });

  app.get('/api/admin/config', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    const config = await getEffectiveConfig(ctx);
    const history = await getConfigChanges(10);
    return c.json({ config, history, restartRequired: ctx.RESTART_REQUIRED_KEYS });
  });

  app.patch('/api/admin/config/:section/:key', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    if (permCheck.roleData && (permCheck.roleData as { readOnly?: boolean }).readOnly === true) return c.json({ error: 'Forbidden: CONFIG_EDIT is read-only for this user' }, 403);
    const section = c.req.param('section');
    const key = c.req.param('key');
    const { value } = await c.req.json();
    if (value === undefined || value === null) return c.json({ error: 'value is required' }, 400);
    const config = await getEffectiveConfig(ctx);
    if (!config[section]) return c.json({ error: `Section "${section}" not found` }, 404);
    if (!(key in config[section])) return c.json({ error: `Key "${key}" not found in section "${section}"` }, 404);
    const oldValue = JSON.stringify(config[section][key]);
    const newValue = typeof value === 'string' ? value : JSON.stringify(value);
    const requiresRestart = (ctx.RESTART_REQUIRED_KEYS[section] || []).includes(key);
    if (!ctx.configOverrides[section]) ctx.configOverrides[section] = {};
    ctx.configOverrides[section][key] = value;
    await recordConfigChange(section, key, oldValue, newValue, user.username, requiresRestart);
    await recordAudit(user.userId, user.username, 'CONFIG_CHANGE', 'config', `${section}.${key}`, JSON.stringify({ oldValue, newValue, requiresRestart }));
    // If LLM config changed, notify MemoryModule to re-init LLM services immediately (no restart needed)
    if (section === 'llm') {
      await bus.emit(Events.LLM_CONFIG_CHANGED, { section, key, value });
    }
    // If TaskWorker config changed, notify TaskWorker to apply new settings immediately
    if (section === 'taskWorker') {
      await bus.emit(Events.TASK_WORKER_CONFIG_CHANGED, { section, key, value });
    }
    return c.json({ success: true, requiresRestart, section, key, value });
  });

  app.get('/api/admin/config/history', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    const history = await getConfigChanges(20);
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

  return app;
}
