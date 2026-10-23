/**
 * Integration Tests — MCP Tools (KSA-284: Backend MCP Server)
 * This file: health endpoint, tools list, core memory tool calls (in-process Hono).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createMcpToolsHarness,
  MCP_VERSION,
  MCP_AUTH_HEADERS,
  type McpToolsHarness,
} from './helpers.js';

let app: McpToolsHarness['app'];

beforeAll(async () => {
  const harness = await createMcpToolsHarness();
  app = harness.app;
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
    expect(data.version).toBe(MCP_VERSION);
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
    const res = await app.request('/mcp/tools/list', { headers: MCP_AUTH_HEADERS });
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
    const res = await app.request('/mcp/tools/list', { headers: MCP_AUTH_HEADERS });
    const data = (await res.json()) as any;
    const toolNames = data.tools.map((t: any) => t.name);
    expect(toolNames).toContain('mem_search');
    expect(toolNames).toContain('mem_ingest');
    expect(toolNames).toContain('mem_delete');
  });

  it('tools list includes orchestration tools', async () => {
    const res = await app.request('/mcp/tools/list', { headers: MCP_AUTH_HEADERS });
    const data = (await res.json()) as any;
    const toolNames = data.tools.map((t: any) => t.name);
    expect(toolNames).toContain('find_tools');
    expect(toolNames).toContain('execute_dynamic_tool');
    expect(toolNames).toContain('orchestration_status');
  });

  it('tools list includes utility tools', async () => {
    const res = await app.request('/mcp/tools/list', { headers: MCP_AUTH_HEADERS });
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
