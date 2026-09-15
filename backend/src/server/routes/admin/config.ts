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
  const os = await import('os');
  const path = await import('path');
  const defaultIndexTempDir = path.join(os.tmpdir(), 'CodeIntel');
  const base: Record<string, Record<string, any>> = {
    server: { port: cfg.port, host: cfg.host, logLevel: cfg.logLevel, indexTempDir: (cfg as any).indexTempDir || defaultIndexTempDir },
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
      concurrency: parseInt(process.env.TASK_WORKER_CONCURRENCY || '6', 10),
      baseInterval: parseInt(process.env.TASK_WORKER_BASE_INTERVAL || '2000', 10),
      maxInterval: parseInt(process.env.TASK_WORKER_MAX_INTERVAL || '30000', 10),
    },
    rateLimit: {
      // Server hard cap (rpm) per IP. Clients may request up to (never above) this.
      maxRpm: parseInt(process.env.RATE_LIMIT_MAX_RPM || (process.env.NODE_ENV === 'production' ? '6000' : '10000'), 10),
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
  } catch (err) { ctx.logger.debug({ err, context: 'llm-config' }, 'DB not ready for LLM config — using env defaults'); }

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
  } catch (err) { ctx.logger.debug({ err, context: 'taskworker-config' }, 'DB not ready for taskWorker config — using env defaults'); }

  // Merge DB-persisted server config (indexTempDir)
  try {
    const serverKeys = ['indexTempDir'] as const;
    for (const key of serverKeys) {
      const val = await getLatestConfigValue('server', key);
      if (val !== undefined && val.trim()) base.server[key] = val;
    }
  } catch (err) { ctx.logger.debug({ err, context: 'server-config' }, 'DB not ready for server config — using env defaults'); }

  // Merge DB-persisted rateLimit config (maxRpm)
  try {
    const val = await getLatestConfigValue('rateLimit', 'maxRpm');
    if (val !== undefined) {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n > 0) base.rateLimit.maxRpm = n;
    }
  } catch (err) { ctx.logger.debug({ err, context: 'ratelimit-config' }, 'DB not ready for rateLimit config — using env defaults'); }

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

    const TEST_MODELS: Record<string, string> = {
    ollama: 'llama3.1',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-sonnet-4',
    openrouter: 'openai/gpt-4o-mini',
    lmstudio: 'local-model',
    'llm-server': 'bocalan/Qwen2.5-Coder-3B-Instruct-Q4_K_M-GGUF',
    gemini: 'gemini-2.0-flash',
    copilot: 'copilot',
    opencode: 'deepseek-v4-flash',
    'opencode-zen': 'deepseek-v4-flash-free',
    dify: 'dify-app',
  };
  const ZEN_FREE_MODELS = ['deepseek-v4-flash-free', 'big-pickle', 'mimo-v2.5-free', 'north-mini-code-free'];

  async function doFetch(url: string, body: object, headers: Record<string, string>, signal: AbortSignal): Promise<{ ok: boolean; status: number; ms: number; text: string }> {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { method: 'POST', headers, signal, body: JSON.stringify(body) });
      return { ok: r.ok, status: r.status, ms: Date.now() - t0, text: await r.text() };
    } catch (e: any) {
      return { ok: false, status: 0, ms: Date.now() - t0, text: e.message || 'Request failed' };
    }
  }

  app.post('/api/admin/llm/test', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    const config = await getEffectiveConfig(ctx);
    const llm = config.llm || {};
    const prov = llm.provider || 'ollama';
    let base = llm.baseUrl || 'http://localhost:11434';
    const isLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(base);
    if (llm.baseUrl && llm.baseUrl !== 'http://localhost:11434' && !isLocalUrl) {
      const urlCheck = validateExternalUrl(base);
      if (!urlCheck.valid) return c.json({ success: false, errorType: 'blocked', message: `SSRF blocked: ${urlCheck.error}` }, 400);
    }
    base = base.replace(/\/+$/, '');
    const chatUrl = base.match(/\/v1$/i) ? base + '/chat/completions' : base + '/v1/chat/completions';
    const anthropicUrl = base.match(/\/v1$/i) ? base.replace(/\/v1$/i, '') + '/v1/messages' : base + '/v1/messages';
    const testModel = llm.model || TEST_MODELS[prov] || 'gpt-4o-mini';
    const hasKey = !!(llm.apiKey && llm.apiKey !== '***');
    const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (hasKey) authHeaders['Authorization'] = 'Bearer ' + llm.apiKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const checks: string[] = [];

    try {
      if (prov === 'ollama') {
        const r = await doFetch(base + '/api/generate', { model: testModel, prompt: 'Say hello in 5 words', stream: false, options: { num_predict: 20 } }, authHeaders, controller.signal);
        clearTimeout(timeout);
        if (r.ok) { const info = JSON.parse(r.text).response || ''; return c.json({ success: true, errorType: null, message: `Connected (${r.ms}ms) [model: ${testModel}] — ${info.substring(0, 80)}` }); }
        const body = JSON.parse(r.text); const msg = body.error?.message || body.response || r.text;
        return c.json({ success: false, errorType: r.status === 401 ? 'auth' : 'http', message: `HTTP ${r.status} — ${msg.substring(0, 200)}` });
      }

      if (prov === 'anthropic') {
        authHeaders['x-api-key'] = llm.apiKey || '';
        const r = await doFetch(anthropicUrl, { model: testModel, max_tokens: 20, messages: [{ role: 'user', content: 'Say hello' }] }, authHeaders, controller.signal);
        clearTimeout(timeout);
        if (r.ok) { const info = JSON.parse(r.text)?.content?.[0]?.text || ''; return c.json({ success: true, errorType: null, message: `Connected + Authenticated (${r.ms}ms) [model: ${testModel}] — ${info.substring(0, 80)}` }); }
        if (r.status === 401) return c.json({ success: false, errorType: 'auth', message: `HTTP ${r.status} — API key rejected (Unauthorized)` });
        const body = JSON.parse(r.text); const msg = body.error?.message || r.text;
        return c.json({ success: false, errorType: 'http', message: `HTTP ${r.status} — ${msg.substring(0, 300)}` });
      }

      if (prov === 'dify') {
        const r = await doFetch(base + '/v1/chat-messages', { inputs: {}, query: 'Say hello in 5 words', response_mode: 'blocking', conversation_id: '', user: 'test' }, authHeaders, controller.signal);
        clearTimeout(timeout);
        if (r.ok) { const info = JSON.parse(r.text).answer || ''; return c.json({ success: true, errorType: null, message: `Connected + Authenticated (${r.ms}ms) — ${info.substring(0, 80)}` }); }
        if (r.status === 401) return c.json({ success: false, errorType: 'auth', message: `HTTP ${r.status} — API key rejected (Unauthorized)` });
        const body = JSON.parse(r.text); const msg = body.message || body.code || r.text;
        return c.json({ success: false, errorType: 'http', message: `HTTP ${r.status} — ${msg.substring(0, 200)}` });
      }

      // Step 1: connectivity probe
      const isZen = prov === 'opencode-zen' || prov === 'opencode';
      if (isZen) {
        const probe = await doFetch(chatUrl, { model: 'deepseek-v4-flash-free', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }, { 'Content-Type': 'application/json' }, controller.signal);
        checks.push(probe.ok ? `✓ Reachable (${probe.ms}ms)` : `⚠ Endpoint: ${probe.status === 401 ? 'auth-gated' : 'HTTP ' + probe.status}`);
      } else {
        try { await fetch(chatUrl.replace('/chat/completions', '/models'), { headers: { 'Content-Type': 'application/json' }, signal: controller.signal }); checks.push(`✓ Reachable`); } catch (err) { ctx.logger.debug({ err, context: 'llm-test' }, 'Models endpoint unreachable'); checks.push(`⚠ Endpoint unreachable`); }
      }

      // Step 2: test user's model
      const freeAndNoKey = isZen && ZEN_FREE_MODELS.includes(testModel) && !hasKey;
      if (freeAndNoKey) { clearTimeout(timeout); return c.json({ success: true, errorType: null, message: `✓ Connected (free model) [model: ${testModel}]`, checks }); }

      const r = await doFetch(chatUrl, { model: testModel, max_tokens: 20, messages: [{ role: 'user', content: 'Say hello' }] }, authHeaders, controller.signal);
      clearTimeout(timeout);

      if (r.ok) {
        let info = 'responded';
        try { const d = JSON.parse(r.text); if (d.choices?.[0]?.message?.content) info = d.choices[0].message.content.substring(0, 80); else if (d.content?.[0]?.text) info = d.content[0].text.substring(0, 80); } catch (err) { ctx.logger.debug({ err, context: 'llm-test' }, 'Failed to parse successful LLM response — non-critical'); }
        return c.json({ success: true, errorType: null, message: `✓ Connected + Authenticated (${r.ms}ms) [model: ${testModel}] — ${info}`, checks });
      }

      // Error handling with suggestions
      let msg = '';
      try { const d = JSON.parse(r.text); const e = d.error || d; msg = e.message || JSON.stringify(d).substring(0, 300); } catch (err) { ctx.logger.debug({ err, context: 'llm-test' }, 'Failed to parse error response'); msg = r.text.substring(0, 300); }
      if (r.status === 401) return c.json({ success: false, errorType: 'auth', message: `HTTP ${r.status} — API key rejected (Unauthorized)`, checks });
      if (r.status === 403) return c.json({ success: false, errorType: 'auth', message: `HTTP ${r.status} — API key lacks permissions (Forbidden)`, checks });
      let hint = '';
      if (isZen && r.status === 400 && (msg.includes('Upstream') || msg.includes('Console'))) hint = ' — This is an OpenCode Zen upstream issue. Try the free model "deepseek-v4-flash-free" or check your Zen balance.';
      return c.json({ success: false, errorType: 'http', message: `HTTP ${r.status} — ${msg.substring(0, 300)}${hint}`, checks });
    } catch (e: any) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') return c.json({ success: false, errorType: 'connection', message: 'Timed out after 30s — server unreachable', checks });
      const msg = e.message || '';
      if (msg.includes('ECONNREFUSED') || msg.includes('connect') || msg.includes('fetch failed'))
        return c.json({ success: false, errorType: 'connection', message: 'Cannot reach server — check the URL and network connectivity', checks });
      return c.json({ success: false, errorType: 'unknown', message: msg.substring(0, 200), checks });
    }
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
    // If rate-limit config changed, hot-reload the middleware cap (no restart)
    if (section === 'rateLimit') {
      await bus.emit(Events.RATE_LIMIT_CONFIG_CHANGED, { section, key, value });
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
    const count = await worker.getRepository().retryAllFailed();
    return c.json({ ok: true, retried: count });
  });

  return app;
}
