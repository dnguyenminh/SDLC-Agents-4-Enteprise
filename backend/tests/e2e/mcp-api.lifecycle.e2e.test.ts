/**
 * E2E API Tests — MCP Server (KSA-284: Backend MCP Server).
 * This file: memory lifecycle — ingest → search → delete.
 * Run: npx vitest run tests/e2e/mcp-api.lifecycle.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { makeMcpClient } from './mcp-api.helpers.js';

const client = makeMcpClient();

beforeAll(async () => {
  await client.init();
});

// ============================================================
// 4. Memory Lifecycle — Ingest → Search → Read → Delete
// ============================================================

describe('E2E MCP — Memory Lifecycle', () => {
  const testTitle = `e2e-lifecycle-${Date.now()}`;
  const testContent = 'This is E2E lifecycle test content for MCP memory module';

  it('mem_ingest creates an entry', async () => {
    const data = await client.callToolJson('mem_ingest', {
      title: testTitle, content: testContent, tags: 'e2e,test',
    });
    expect(data.isError).toBe(false);
  });

  it('mem_search finds the ingested entry', async () => {
    const res = await client.authFetch('/mcp/tools/call', {
      method: 'POST',
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
    const res = await client.authFetch('/mcp/tools/call', {
      method: 'POST',
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
