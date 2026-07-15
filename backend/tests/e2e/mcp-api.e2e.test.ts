/**
 * E2E API Tests — MCP Server (KSA-284: Backend MCP Server)
 * Tests real HTTP calls to the E2E test server (dynamic port).
 *
 * Run: npx vitest run tests/e2e/mcp-api.e2e.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL } from './setup/e2e-config.js';

// ============================================================
// Setup: Verify server is running
// ============================================================

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok && res.status !== 503) throw new Error(`Health check returned ${res.status}`);
  } catch (err) {
    throw new Error(
      `Server is not running at ${BASE_URL}. Start it with "npm run dev" before running E2E tests.\n` +
        `Original error: ${err}`,
    );
  }
});

// ============================================================
// 1. Health Endpoint
// ============================================================

describe('E2E MCP — Health', () => {
  it('GET /health returns 200 with modules status', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.version).toBeDefined();
    expect(typeof data.uptime).toBe('number');
    expect(typeof data.tools_loaded).toBe('number');
    expect(data.tools_loaded).toBeGreaterThan(0);
    expect(data.modules).toBeDefined();
    expect(typeof data.modules).toBe('object');
  });

  it('GET /health modules all report ready', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    const modules = data.modules as Record<string, string>;
    const allReady = Object.values(modules).every(s => s === 'ready');
    expect(allReady).toBe(true);
  });
});

// ============================================================
// 2. Tools List
// ============================================================

describe('E2E MCP — Tools List', () => {
  it('GET /mcp/tools/list returns 200 with tool array', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/list`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tools).toBeInstanceOf(Array);
    expect(data.tools.length).toBeGreaterThan(10);
  });

  it('each tool has required fields', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/list`);
    const data = await res.json();
    for (const tool of data.tools.slice(0, 10)) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it('includes core memory tools', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/list`);
    const data = await res.json();
    const names = data.tools.map((t: any) => t.name);
    expect(names).toContain('mem_search');
    expect(names).toContain('mem_ingest');
    expect(names).toContain('mem_delete');
  });

  it('includes orchestration tools', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/list`);
    const data = await res.json();
    const names = data.tools.map((t: any) => t.name);
    expect(names).toContain('find_tools');
    expect(names).toContain('execute_dynamic_tool');
  });
});

// ============================================================
// 3. Tool Call Execution
// ============================================================

describe('E2E MCP — Tool Call', () => {
  it('POST /mcp/tools/call executes mem_search', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'mem_search',
        arguments: { query: 'code intelligence', limit: 5 },
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBeInstanceOf(Array);
    expect(data.content.length).toBeGreaterThan(0);
    expect(data.content[0].type).toBe('text');
    expect(data.isError).toBe(false);
  });

  it('POST /mcp/tools/call executes find_tools', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'find_tools',
        arguments: { query: 'memory', threshold: 0.3, top_k: 5 },
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isError).toBe(false);
    // find_tools should return text with tool matches
    const text = data.content[0].text;
    expect(text).toBeDefined();
  });

  it('POST /mcp/tools/call executes agent_log', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'agent_log',
        arguments: { level: 'info', message: 'E2E test log', agent: 'e2e-test' },
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isError).toBe(false);
  });

  it('POST /mcp/tools/call executes orchestration_status', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'orchestration_status',
        arguments: {},
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isError).toBe(false);
  });
});

// ============================================================
// 4. Memory Lifecycle — Ingest → Search → Read → Delete
// ============================================================

describe('E2E MCP — Memory Lifecycle', () => {
  const testTitle = `e2e-lifecycle-${Date.now()}`;
  const testContent = 'This is E2E lifecycle test content for MCP memory module';

  it('mem_ingest creates an entry', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'mem_ingest',
        arguments: { title: testTitle, content: testContent, tags: 'e2e,test' },
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isError).toBe(false);
  });

  it('mem_search finds the ingested entry', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'mem_search',
        arguments: { query: testTitle, limit: 10 },
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isError).toBe(false);
    // The search result should contain text output
    expect(data.content[0].text).toBeDefined();
  });

  it('mem_delete removes the entry', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'mem_delete',
        arguments: { id: testTitle },
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isError).toBe(false);
  });
});

// ============================================================
// 5. Error Cases
// ============================================================

describe('E2E MCP — Error Cases', () => {
  it('unknown tool returns 404 with TOOL_NOT_FOUND', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'totally_fake_tool_that_does_not_exist',
        arguments: {},
      }),
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe('TOOL_NOT_FOUND');
  });

  it('missing tool_name returns 400', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arguments: { query: 'test' } }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_REQUEST');
  });

  it('invalid JSON returns 400', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"broken json',
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_REQUEST');
  });

  it('empty body returns 400', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    expect(res.status).toBe(400);
  });

  it('empty tool_name string returns 400', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_name: '', arguments: {} }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_REQUEST');
  });
});
