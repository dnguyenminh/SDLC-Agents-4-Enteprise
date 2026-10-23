/**
 * E2E API Tests — MCP Server (KSA-284: Backend MCP Server).
 * This file: tool call execution + error cases.
 * Run: npx vitest run tests/e2e/mcp-api.tool-call.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { makeMcpClient } from './mcp-api.helpers.js';

const client = makeMcpClient();

beforeAll(async () => {
  await client.init();
});

// ============================================================
// 3. Tool Call Execution
// ============================================================

describe('E2E MCP — Tool Call', () => {
  it('POST /mcp/tools/call executes mem_search', async () => {
    const res = await client.authFetch('/mcp/tools/call', {
      method: 'POST',
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
    const res = await client.authFetch('/mcp/tools/call', {
      method: 'POST',
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
    const res = await client.authFetch('/mcp/tools/call', {
      method: 'POST',
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
    const res = await client.authFetch('/mcp/tools/call', {
      method: 'POST',
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
// 5. Error Cases
// ============================================================

describe('E2E MCP — Error Cases', () => {
  it('unknown tool returns 404 with TOOL_NOT_FOUND', async () => {
    const res = await client.authFetch('/mcp/tools/call', {
      method: 'POST',
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
    const res = await client.authFetch('/mcp/tools/call', {
      method: 'POST',
      body: JSON.stringify({ arguments: { query: 'test' } }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_REQUEST');
  });

  it('invalid JSON returns 400', async () => {
    const res = await client.authFetch('/mcp/tools/call', {
      method: 'POST',
      body: '{"broken json',
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_REQUEST');
  });

  it('empty body returns 400', async () => {
    const res = await client.authFetch('/mcp/tools/call', {
      method: 'POST',
      body: '',
    });
    expect(res.status).toBe(400);
  });

  it('empty tool_name string returns 400', async () => {
    const res = await client.authFetch('/mcp/tools/call', {
      method: 'POST',
      body: JSON.stringify({ tool_name: '', arguments: {} }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_REQUEST');
  });
});
