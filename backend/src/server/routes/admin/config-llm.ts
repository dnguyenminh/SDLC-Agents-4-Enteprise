/** LLM route registration — models listing + connectivity test (BR-18). */
import type { Hono } from 'hono';
import { validateExternalUrl } from '../../middleware/url-validator.js';
import type { AdminContext } from './context.js';
import { getEffectiveConfig } from './config-effective.js';

const TEST_MODELS: Record<string, string> = {
  ollama: 'llama3.1',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4',
  openrouter: 'openai/gpt-4o-mini',
  lmstudio: 'local-model',
  gemini: 'gemini-2.0-flash',
  copilot: 'copilot',
  opencode: 'deepseek-v4-flash',
  'opencode-zen': 'deepseek-v4-flash-free',
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

export function registerConfigLlmRoutes(app: Hono, ctx: AdminContext): void {
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
    const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (permCheck instanceof Response) return permCheck;
    return handleLlmTest(c, ctx);
  });
}

async function handleLlmTest(c: any, ctx: AdminContext): Promise<Response> {
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
    if (prov === 'ollama') return await testOllama(c, base, testModel, authHeaders, controller, timeout);
    if (prov === 'anthropic') return await testAnthropic(c, anthropicUrl, testModel, llm.apiKey || '', authHeaders, controller, timeout);

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
}

async function testOllama(c: any, base: string, testModel: string, authHeaders: Record<string, string>, controller: AbortController, timeout: ReturnType<typeof setTimeout>): Promise<Response> {
  const r = await doFetch(base + '/api/generate', { model: testModel, prompt: 'Say hello in 5 words', stream: false, options: { num_predict: 20 } }, authHeaders, controller.signal);
  clearTimeout(timeout);
  if (r.ok) { const info = JSON.parse(r.text).response || ''; return c.json({ success: true, errorType: null, message: `Connected (${r.ms}ms) [model: ${testModel}] — ${info.substring(0, 80)}` }); }
  const body = JSON.parse(r.text); const msg = body.error?.message || body.response || r.text;
  return c.json({ success: false, errorType: r.status === 401 ? 'auth' : 'http', message: `HTTP ${r.status} — ${msg.substring(0, 200)}` });
}

async function testAnthropic(c: any, anthropicUrl: string, testModel: string, apiKey: string, authHeaders: Record<string, string>, controller: AbortController, timeout: ReturnType<typeof setTimeout>): Promise<Response> {
  authHeaders['x-api-key'] = apiKey;
  const r = await doFetch(anthropicUrl, { model: testModel, max_tokens: 20, messages: [{ role: 'user', content: 'Say hello' }] }, authHeaders, controller.signal);
  clearTimeout(timeout);
  if (r.ok) { const info = JSON.parse(r.text)?.content?.[0]?.text || ''; return c.json({ success: true, errorType: null, message: `Connected + Authenticated (${r.ms}ms) [model: ${testModel}] — ${info.substring(0, 80)}` }); }
  if (r.status === 401) return c.json({ success: false, errorType: 'auth', message: `HTTP ${r.status} — API key rejected (Unauthorized)` });
  const body = JSON.parse(r.text); const msg = body.error?.message || r.text;
  return c.json({ success: false, errorType: 'http', message: `HTTP ${r.status} — ${msg.substring(0, 300)}` });
}
