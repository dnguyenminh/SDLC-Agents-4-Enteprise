/**
 * Unit tests for MCP Bridge Extension (split from mcp-bridge-extension.test.ts).
 * SA4E-367 — buildMcpBridgeAgentTools registry + discovery pair + PBT.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { createExecuteHandler, TOOLS, bridgeRequiresApproval, buildMcpBridgeAgentTools } from '../mcp-bridge-extension';
import { TOOL_ALLOWLIST, FIND_TOOL_NAME, isDiscoveryTool } from '../tool-definitions';
import type { McpBridge } from '../../../mcp/mcp-bridge';
import { McpToolTimeoutError } from '../../../mcp/mcp-bridge';
import { McpServerNotRunningError } from '../../../types/server-types';
import { asTools } from './mcp-bridge-extension.helpers';

// SA4E-367 (ported SA4E-364 UT-01..UT-18/PBT-01, extended to the discovery
// pair): default build = 4 concrete; opt-in === true adds find_tools +
// execute_dynamic_tool TOGETHER (6 tools). AC-3 asserts target the BUILT
// registry — never allowlist name strings (DISCOVERY_TOOLS trap).
describe('buildMcpBridgeAgentTools (SA4E-367 discovery pair)', () => {
  const CONCRETE = ['jira_get_issue', 'mem_search', 'mem_ingest', 'code_search'];
  const PAIR = ['find_tools', 'execute_dynamic_tool'];
  let mockBridge: McpBridge;

  beforeEach(() => {
    mockBridge = { callTool: vi.fn() } as any;
  });

  it('default build returns exactly the 4 concrete tools (pair absent)', () => {
    const tools = asTools(buildMcpBridgeAgentTools(mockBridge));
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name).sort())
      .toEqual(['code_search', 'jira_get_issue', 'mem_ingest', 'mem_search']);
    for (const name of PAIR) expect(tools.map((t) => t.name)).not.toContain(name);
  });

  it('opt-in === true adds the pair TOGETHER (6 tools); non-true values stay at 4', () => {
    const opted = asTools(buildMcpBridgeAgentTools(mockBridge, { allowDynamicChaining: true }));
    expect(opted).toHaveLength(6);
    for (const name of PAIR) expect(opted.map((t) => t.name)).toContain(name);
    for (const notTrue of [false, 0, undefined]) {
      const names = asTools(buildMcpBridgeAgentTools(mockBridge, { allowDynamicChaining: notTrue as never }))
        .map((t) => t.name);
      for (const name of PAIR) expect(names).not.toContain(name);
      expect(names).toHaveLength(4);
    }
  });

  it('AgentTool shape with schema passthrough (same reference) from TOOLS', () => {
    const tools = asTools(buildMcpBridgeAgentTools(mockBridge, { allowDynamicChaining: true }));
    expect(tools).toHaveLength(6);
    for (const tool of tools) {
      const def = TOOLS.find((t) => t.name === tool.name)!;
      expect(def).toBeDefined();
      expect(typeof tool.execute).toBe('function');
      expect(tool.parameters).toBe(def.parameters); // toBe — same reference (BR-01)
      expect(tool.label).toBe(def.label);
      expect(tool.description).toBe(def.description);
    }
    expect(tools.find((t) => t.name === 'find_tools')?.label).toBe('Find Tools');
  });

  it('isDiscoveryTool covers exactly the pair; TOOL_ALLOWLIST stays at 4 (SEC condition 1)', () => {
    expect(isDiscoveryTool('find_tools')).toBe(true);
    expect(isDiscoveryTool('execute_dynamic_tool')).toBe(true);
    expect(isDiscoveryTool('code_search')).toBe(false);
    expect(FIND_TOOL_NAME).toBe('find_tools');
    expect(TOOL_ALLOWLIST.size).toBe(4);
    expect(TOOL_ALLOWLIST.has('find_tools')).toBe(false);
  });

  it('find_tools approval is false (read-only discovery); execute_dynamic_tool keeps approval', () => {
    expect(bridgeRequiresApproval('find_tools')).toBe(false);
    expect(bridgeRequiresApproval('execute_dynamic_tool')).toBe(true);
  });

  it('find_tools executes via bridge.callTool; missing query fails validation (EC-8)', async () => {
    const audit = vi.fn();
    (mockBridge.callTool as any).mockResolvedValue({ tools: [] });
    const tools = asTools(buildMcpBridgeAgentTools(mockBridge, { allowDynamicChaining: true, auditLog: audit }));
    const findTools = tools.find((t) => t.name === 'find_tools')!;
    const result = await findTools.execute('id-f1', { query: 'draw diagram', top_k: 5 });
    expect(mockBridge.callTool).toHaveBeenCalledTimes(1);
    expect(mockBridge.callTool).toHaveBeenCalledWith('find_tools', { query: 'draw diagram', top_k: 5 });
    expect(result.details).toMatchObject({ success: true, toolName: 'find_tools' });
    expect(audit.mock.calls[0][0]).toEqual({
      toolName: 'find_tools', argKeys: ['query', 'top_k'], decision: 'auto-approved',
    });
    expect(JSON.stringify(audit.mock.calls[0][0])).not.toContain('draw diagram');
    // EC-8: missing required query → validation text, no bridge call, no audit.
    (mockBridge.callTool as any).mockClear();
    audit.mockClear();
    const invalid = await findTools.execute('id-f2', {});
    expect(invalid.content[0].text).toMatch(/^Validation failed: /);
    expect(invalid.details).toMatchObject({ error: 'validation', toolName: 'find_tools' });
    expect(mockBridge.callTool).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('find_tools handler without opt-in → chaining_denied (pair defense-in-depth, EC-1)', async () => {
    const audit = vi.fn();
    const handler = createExecuteHandler(
      mockBridge, 'find_tools', { required: ['query'] }, { auditLog: audit },
    );
    const result = await handler('id-f3', { query: 'x' });
    expect(result.content[0].text)
      .toBe('Dynamic tool chaining is disabled: find_tools requires explicit opt-in');
    expect(result.details).toMatchObject({ error: 'chaining_denied', toolName: 'find_tools' });
    expect(mockBridge.callTool).not.toHaveBeenCalled();
  });

  // SECURITY-REVIEW condition 2 (L-3/EC-9): Req-5 names are DENIED as chained
  // targets today (∉ TOOL_ALLOWLIST) — locks the fail-closed default.
  it('EC-9: opted-in dynamic call with Req-5 targets → chaining_denied (fail-closed)', async () => {
    const audit = vi.fn();
    const handler = createExecuteHandler(
      mockBridge, 'execute_dynamic_tool', { required: ['tool_name'] },
      { allowDynamicChaining: true, auditLog: audit },
    );
    for (const target of ['stream_write_file', 'drawio_export_png', 'get_curated_context', 'orchestration_status', 'embed_image']) {
      const denied = await handler('id-ec9', { tool_name: target, arguments: {} });
      expect(denied.content[0].text).toBe(`Dynamic tool chaining denied: '${target}' is not allowlisted`);
      expect(denied.details).toMatchObject({
        error: 'chaining_denied', toolName: 'execute_dynamic_tool', target,
      });
    }
    expect(mockBridge.callTool).not.toHaveBeenCalled();
    expect(audit.mock.calls.every((c) => c[0].decision === 'denied')).toBe(true);
    // Control: an allowlisted chained target still passes through.
    const allowed = await handler('id-ec9-ok', { tool_name: 'mem_ingest', arguments: { content: 'x' } });
    expect(mockBridge.callTool).toHaveBeenCalledWith(
      'execute_dynamic_tool', { tool_name: 'mem_ingest', arguments: { content: 'x' } },
    );
    expect(allowed.details?.success).toBe(true);
  });

  it('opted-in execute_dynamic_tool keeps approval=true (denied hook blocks, audited)', async () => {
    const audit = vi.fn();
    const tools = asTools(buildMcpBridgeAgentTools(mockBridge, {
      allowDynamicChaining: true, approvalHook: async () => false, auditLog: audit,
    }));
    const dyn = tools.find((t) => t.name === 'execute_dynamic_tool')!;
    const result = await dyn.execute('id-a1', { tool_name: 'code_search', arguments: { query: 'x' } });
    expect(result.content[0].text).toBe('Tool call denied by approval: execute_dynamic_tool');
    expect(result.details?.error).toBe('approval_denied');
    expect(mockBridge.callTool).not.toHaveBeenCalled();
  });

  it('McpServerNotRunningError → exact fail-safe error text, no throw (EC-5)', async () => {
    (mockBridge.callTool as any).mockRejectedValue(new McpServerNotRunningError());
    const tools = asTools(buildMcpBridgeAgentTools(mockBridge));
    const memSearch = tools.find((t) => t.name === 'mem_search')!;
    const result = await memSearch.execute('id-2', { query: 'personalized rules' });
    expect(result.content[0].text).toBe('Error invoking mem_search: MCP Server is not running.');
    expect(result.details).toMatchObject({ error: 'mcp_error', toolName: 'mem_search' });
  });

  it('timeout and generic bridge errors → error text without throwing (EC-6/EC-7)', async () => {
    const tools = asTools(buildMcpBridgeAgentTools(mockBridge));
    const memSearch = tools.find((t) => t.name === 'mem_search')!;
    (mockBridge.callTool as any).mockRejectedValueOnce(new McpToolTimeoutError('mem_search', 60000));
    const timedOut = await memSearch.execute('id-7', { query: 'q' });
    expect(timedOut.content[0].text).toContain('Error invoking mem_search:');
    expect(timedOut.content[0].text).toContain('timed out after 60000ms');
    expect(timedOut.details?.error).toBe('mcp_error');
    (mockBridge.callTool as any).mockRejectedValueOnce(new Error('HTTP 500 from MCP server'));
    const generic = await memSearch.execute('id-8', { query: 'q' });
    expect(generic.content[0].text).toBe('Error invoking mem_search: HTTP 500 from MCP server');
    expect(generic.details?.error).toBe('mcp_error');
  });

  it('PBT-01: property — all option combos build a consistent registry (no throw, no network)', () => {
    const optionsArb = fc.record({
      allowDynamicChaining: fc.option(fc.boolean(), { nil: undefined }),
      withHook: fc.boolean(),
      withAudit: fc.boolean(),
    });
    fc.assert(
      fc.property(optionsArb, ({ allowDynamicChaining, withHook, withAudit }) => {
        const callTool = vi.fn();
        const bridge = { callTool } as unknown as McpBridge;
        const options: Record<string, unknown> = {
          allowDynamicChaining,
          ...(withHook ? { approvalHook: async () => true } : {}),
          ...(withAudit ? { auditLog: () => undefined } : {}),
        };
        let built: Array<{ name: string }> = [];
        expect(() => {
          built = buildMcpBridgeAgentTools(bridge, options as never) as Array<{ name: string }>;
        }).not.toThrow();
        const names = built.map((t) => t.name);
        for (const name of CONCRETE) expect(names).toContain(name);
        // Pair travels together: both present iff opt-in === true.
        for (const name of PAIR) expect(names.includes(name)).toBe(allowDynamicChaining === true);
        expect(built).toHaveLength(allowDynamicChaining === true ? 6 : 4);
        expect(new Set(names).size).toBe(names.length); // unique (BR-1)
        expect(callTool).not.toHaveBeenCalled(); // 0 network during build (N-6)
      }),
      { numRuns: 200 },
    );
  });
});
