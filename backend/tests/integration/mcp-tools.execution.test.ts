/**
 * Integration Tests — MCP Tools (KSA-284: Backend MCP Server)
 * This file: orchestration tools, utility tools, error handling (in-process Hono).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createMcpToolsHarness, type McpToolsHarness } from './helpers.js';

let app: McpToolsHarness['app'];

beforeAll(async () => {
  const harness = await createMcpToolsHarness();
  app = harness.app;
}, 30_000);

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
