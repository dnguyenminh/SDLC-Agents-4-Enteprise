/**
 * Integration Tests — MCP Tools (KSA-284: Backend MCP Server)
 * Tests MCP tool execution via Hono in-process (app.request).
 * Covers: health, tools list, tool call, core tools, orchestration tools, utility tools, error handling.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import pino from 'pino';
import { ModuleRegistry } from '../../src/modules/ModuleRegistry.js';
import { MemoryModule } from '../../src/modules/memory/MemoryModule.js';
import { OrchestrationModule } from '../../src/modules/orchestration/OrchestrationModule.js';
import { UtilityModule } from '../../src/modules/utility/UtilityModule.js';
import { ToolRouter } from '../../src/tool-router/ToolRouter.js';
import { createHealthRoute } from '../../src/server/routes/health.js';
import { createToolsRoute } from '../../src/server/routes/tools.js';

const logger = pino({ level: 'silent' });
const VERSION = '1.0.0-test';

// SA4E-41: /mcp/tools/list requires auth. Use the API key seeded in vitest.setup.ts.
const AUTH_HEADERS = { 'X-API-Key': process.env.CODE_INTEL_API_KEY || 'test-api-key-01' };

let app: Hono;
let registry: ModuleRegistry;

beforeAll(async () => {
  registry = new ModuleRegistry(logger);
  registry.register(new MemoryModule(logger));
  registry.register(new OrchestrationModule(logger, registry));
  registry.register(new UtilityModule(logger));
  await registry.initializeAll();

  const toolRouter = new ToolRouter(registry, logger);
  app = new Hono();
  app.route('/', createHealthRoute(registry, VERSION));
  app.route('/', createToolsRoute(toolRouter, logger));
}, 30_000);

// ============================================================
// 1. Health Endpoint
// ============================================================

describe('MCP Integration — Health Endpoint', () => {
  it.skip('GET /health returns 200 with status and modules', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe('healthy');
    expect(data.version).toBe(VERSION);
    expect(typeof data.uptime).toBe('number');
    expect(typeof data.tools_loaded).toBe('number');
    expect(data.tools_loaded).toBeGreaterThan(0);
    expect(data.modules).toBeDefined();
    expect(data.modules.memory).toBe('ready');
  });
});

// ============================================================
// 2. Tools List
// ============================================================

describe('MCP Integration — Tools List', () => {
  it('GET /mcp/tools/list returns all registered tools', async () => {
    const res = await app.request('/mcp/tools/list', { headers: AUTH_HEADERS });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.tools).toBeInstanceOf(Array);
    expect(data.tools.length).toBeGreaterThan(0);

    // Each tool has name, description, inputSchema
    const firstTool = data.tools[0];
    expect(firstTool).toHaveProperty('name');
    expect(firstTool).toHaveProperty('description');
    expect(firstTool).toHaveProperty('inputSchema');
  });

  it.skip('tools list includes memory tools', async () => {
    const res = await app.request('/mcp/tools/list', { headers: AUTH_HEADERS });
    const data = (await res.json()) as any;
    const toolNames = data.tools.map((t: any) => t.name);
    expect(toolNames).toContain('mem_search');
    expect(toolNames).toContain('mem_ingest');
    expect(toolNames).toContain('mem_delete');
  });

  it('tools list includes orchestration tools', async () => {
    const res = await app.request('/mcp/tools/list', { headers: AUTH_HEADERS });
    const data = (await res.json()) as any;
    const toolNames = data.tools.map((t: any) => t.name);
    expect(toolNames).toContain('find_tools');
    expect(toolNames).toContain('execute_dynamic_tool');
    expect(toolNames).toContain('orchestration_status');
  });

  it('tools list includes utility tools', async () => {
    const res = await app.request('/mcp/tools/list', { headers: AUTH_HEADERS });
    const data = (await res.json()) as any;
    const toolNames = data.tools.map((t: any) => t.name);
    expect(toolNames).toContain('agent_log');
    expect(toolNames).toContain('stream_write_file');
  });
});

// ============================================================
// 3. Tool Call — Core Memory Tools
// ============================================================

describe('MCP Integration — Core Memory Tools', () => {
  it.skip('mem_search returns results for query', async () => {
    const res = await app.request('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'mem_search',
        arguments: { query: 'test query', limit: 5 },
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.content).toBeInstanceOf(Array);
    expect(data.content[0].type).toBe('text');
    expect(data.isError).toBe(false);
  });

  it.skip('mem_ingest accepts content', async () => {
    const res = await app.request('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'mem_ingest',
        arguments: { title: 'Test Entry', content: 'Some content here', tags: 'test' },
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.isError).toBe(false);
    expect(data.content[0].text).toContain('Test Entry');
  });

  it.skip('mem_delete accepts id', async () => {
    // Seed an entry first so we can delete a real numeric id.
    const seedRes = await app.request('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'mem_ingest',
        arguments: { title: 'Delete Me', content: 'Entry to delete' },
      }),
    });
    expect(seedRes.status).toBe(200);
    const seedData = (await seedRes.json()) as any;
    expect(seedData.isError).toBe(false);
    const seedText: string = seedData.content?.[0]?.text || '';
    const idMatch = seedText.match(/id=(\d+)/);
    expect(idMatch).toBeTruthy();
    const seededId = Number(idMatch![1]);

    const res = await app.request('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'mem_delete',
        arguments: { id: seededId },
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    if (data.isError) {
      // Print to stderr so CI always shows it (vitest suppresses stdout on pass)
      process.stderr.write(`[mem_delete DIAG] id=${seededId} body=${JSON.stringify(data)}\n`);
    }
    expect(data.isError).toBe(false);
  });
});

// ============================================================
// 4. Tool Call — Orchestration Tools
// ============================================================

describe('MCP Integration — Orchestration Tools', () => {
  it('find_tools returns matching tools', async () => {
    const res = await app.request('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'find_tools',
        arguments: { query: 'memory search', threshold: 0.3, top_k: 5 },
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.isError).toBe(false);
    expect(data.content[0].type).toBe('text');
  });

  it('orchestration_status returns server status', async () => {
    const res = await app.request('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'orchestration_status',
        arguments: {},
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.isError).toBe(false);
  });

  it.skip('execute_dynamic_tool routes to actual tool', async () => {
    const res = await app.request('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'execute_dynamic_tool',
        arguments: { tool_name: 'mem_search', arguments: { query: 'test' } },
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.isError).toBe(false);
  });
});

// ============================================================
// 5. Tool Call — Utility Tools
// ============================================================

describe('MCP Integration — Utility Tools', () => {
  it('agent_log accepts log message', async () => {
    const res = await app.request('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'agent_log',
        arguments: { level: 'info', message: 'Test log message', agent: 'test-agent' },
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.isError).toBe(false);
  });

  it('stream_write_file accepts file content', async () => {
    const res = await app.request('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'stream_write_file',
        arguments: { path: 'test-output.txt', content: 'Test content' },
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.isError).toBe(false);
  });
});

// ============================================================
// 6. Error Handling
// ============================================================

describe('MCP Integration — Error Handling', () => {
  it('unknown tool name returns 404', async () => {
    const res = await app.request('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'nonexistent_tool_xyz',
        arguments: {},
      }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe('TOOL_NOT_FOUND');
    expect(data.error.message).toContain('nonexistent_tool_xyz');
  });

  it('missing tool_name returns 400', async () => {
    const res = await app.request('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arguments: {} }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe('INVALID_REQUEST');
  });

  it('invalid JSON body returns 400', async () => {
    const res = await app.request('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json{{{',
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe('INVALID_REQUEST');
  });

  it('empty tool_name returns 400', async () => {
    const res = await app.request('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_name: '', arguments: {} }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe('INVALID_REQUEST');
  });
});
