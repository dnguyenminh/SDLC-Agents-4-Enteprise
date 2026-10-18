/**
 * McpBridge tests (split from mcp-bridge.test.ts).
 * SA4E-364 — buildMcpBridgeAgentTools over the real McpBridge transport.
 */
import { describe, it, expect, vi } from 'vitest';
import { McpBridge } from '../mcp-bridge';
import { buildMcpBridgeAgentTools } from '../../pi-agent/extensions/mcp-bridge-extension';

/** Test-side view of the built bridge AgentTool (handler positional execute). */
type BuiltTool = {
  name: string;
  execute: (id: string, params: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    details?: Record<string, unknown>;
  }>;
};

describe('SA4E-364 — buildMcpBridgeAgentTools over the real McpBridge transport', () => {
  // STC: IT-01 — server stopped → fail-closed error text from the REAL bridge
  // (isAvailable check), invokeTool never called, error path < 50ms (N-4).
  it('IT-01: real bridge + manager stopped → exact error text, no network, < 50ms', async () => {
    const manager = { status: 'stopped', invokeTool: vi.fn(), port: null };
    const tools = buildMcpBridgeAgentTools(new McpBridge(manager as never)) as unknown as BuiltTool[];
    expect(tools.map((t) => t.name).sort())
      .toEqual(['code_search', 'jira_get_issue', 'mem_ingest', 'mem_search']);
    const memSearch = tools.find((t) => t.name === 'mem_search')!;
    const t0 = performance.now();
    const result = await memSearch.execute('it-1', { query: 'personalized rules' });
    const dtMs = performance.now() - t0;
    expect(result.content[0].text).toBe('Error invoking mem_search: MCP Server is not running.');
    expect(result.details).toMatchObject({ error: 'mcp_error', toolName: 'mem_search' });
    expect(manager.invokeTool).not.toHaveBeenCalled(); // fail-closed before transport
    expect(dtMs).toBeLessThan(50); // N-4 sanity — local check, zero network
  });

  // STC: IT-02 — server running → success through the REAL transport
  // (deep-cloned args + interceptResponse pass-through).
  it('IT-02: real bridge + manager running → success through the real transport', async () => {
    const manager = {
      status: 'running',
      invokeTool: vi.fn().mockResolvedValue('KB hits: 3 entries about personalized rules'),
      port: 12345,
    };
    const tools = buildMcpBridgeAgentTools(new McpBridge(manager as never)) as unknown as BuiltTool[];
    const memSearch = tools.find((t) => t.name === 'mem_search')!;
    const result = await memSearch.execute('it-2', { query: 'personalized rules', limit: 5 });
    expect(result.content[0].text).toContain('personalized rules');
    expect(manager.invokeTool).toHaveBeenCalledWith('mem_search', { query: 'personalized rules', limit: 5 });
    expect(result.details).toMatchObject({ success: true, toolName: 'mem_search' });
  });
});
