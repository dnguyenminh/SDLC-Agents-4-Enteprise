/**
 * Admin route tests — config + MCP servers + config reset (STORY 8).
 * Split from admin.test.ts to keep each file under the CI line-count gate
 * (<=200 lines). No logic changed — tests only relocated.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { setupAdmin } from './admin.helpers.js';

let app: Hono;
let authHeaders: () => Record<string, string>;

beforeAll(async () => {
  const ctx = await setupAdmin();
  app = ctx.app;
  authHeaders = ctx.authHeaders;
});

describe('Admin Routes — /api/admin/config', () => {
  it('GET /api/admin/config returns configuration', async () => {
    const res = await app.request('/api/admin/config', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.config.server.port).toBe(48721);
    // SA4E-44/AD-6: embedding config is now real — HF model id + active backend.
    expect(body.config.embedding.model).toBe('Xenova/paraphrase-multilingual-MiniLM-L12-v2');
    expect(body.config.embedding.backend).toBe('onnx');
    expect(body.config.embedding.dimensions).toBe(384);
    expect(body).toHaveProperty('history');
    expect(body).toHaveProperty('restartRequired');
  });

  it('PATCH /api/admin/config/:section/:key updates value', async () => {
    const res = await app.request('/api/admin/config/server/logLevel', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ value: 'debug' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.requiresRestart).toBe(false);
    expect(body.value).toBe('debug');
  });

  it('PATCH /api/admin/config with restart-required key returns requiresRestart=true', async () => {
    const res = await app.request('/api/admin/config/server/port', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ value: 9999 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.requiresRestart).toBe(true);
  });

  it('PATCH /api/admin/config with invalid section returns 404', async () => {
    const res = await app.request('/api/admin/config/nonexistent/key', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ value: 'test' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('Admin Routes — /api/admin/mcp/servers', () => {
  it('GET /api/admin/mcp/servers returns server list', async () => {
    const res = await app.request('/api/admin/mcp/servers', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('servers');
    expect(Array.isArray(body.servers)).toBe(true);
  });

  it('POST /api/admin/mcp/servers/:id/restart returns success', async () => {
    const res = await app.request('/api/admin/mcp/servers/test-server/restart', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });
});

// ===== STORY 8: Config Reset to Defaults =====
describe('Admin Routes — Config Reset to Defaults (STORY 8)', () => {
  it('POST /api/admin/config/:section/reset clears overrides for section', async () => {
    // First set an override
    await app.request('/api/admin/config/server/logLevel', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ value: 'trace' }),
    });

    // Now reset the server section
    const res = await app.request('/api/admin/config/server/reset', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.section).toBe('server');
    expect(body.config).toHaveProperty('port');
    expect(body.config).toHaveProperty('logLevel');
    // logLevel should be back to default (not 'trace')
    expect(body.config.logLevel).not.toBe('trace');
  });

  it('POST /api/admin/config/reset-all clears all overrides', async () => {
    // Set overrides in multiple sections
    await app.request('/api/admin/config/server/logLevel', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ value: 'trace' }),
    });
    await app.request('/api/admin/config/kb/maxEntries', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ value: 999 }),
    });

    // Reset all
    const res = await app.request('/api/admin/config/reset-all', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.config).toHaveProperty('server');
    expect(body.config).toHaveProperty('kb');
    // Values should be defaults
    expect(body.config.server.logLevel).not.toBe('trace');
    expect(body.config.kb.maxEntries).toBe(100000);
  });

  it('POST /api/admin/config/nonexistent/reset returns 404', async () => {
    const res = await app.request('/api/admin/config/nonexistent/reset', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });
});
