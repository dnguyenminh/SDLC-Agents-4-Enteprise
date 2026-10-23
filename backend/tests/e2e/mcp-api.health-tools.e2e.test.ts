/**
 * E2E API Tests — MCP Server (KSA-284: Backend MCP Server).
 * This file: health endpoint + tools list.
 * Run: npx vitest run tests/e2e/mcp-api.health-tools.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL } from './setup/e2e-config.js';
import { makeMcpClient } from './mcp-api.helpers.js';

const client = makeMcpClient();

beforeAll(async () => {
  await client.init();
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
    const res = await client.authFetch('/mcp/tools/list');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tools).toBeInstanceOf(Array);
    expect(data.tools.length).toBeGreaterThan(10);
  });

  it('each tool has required fields', async () => {
    const res = await client.authFetch('/mcp/tools/list');
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
    const res = await client.authFetch('/mcp/tools/list');
    const data = await res.json();
    const names = data.tools.map((t: any) => t.name);
    expect(names).toContain('mem_search');
    expect(names).toContain('mem_ingest');
    expect(names).toContain('mem_delete');
  });

  it('includes orchestration tools', async () => {
    const res = await client.authFetch('/mcp/tools/list');
    const data = await res.json();
    const names = data.tools.map((t: any) => t.name);
    expect(names).toContain('find_tools');
    expect(names).toContain('execute_dynamic_tool');
  });
});
