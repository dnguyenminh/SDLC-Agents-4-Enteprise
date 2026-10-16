/**
 * Unit tests for MCP Bridge Extension
 * SA4E-316
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { createExecuteHandler, TOOLS, bridgeRequiresApproval, buildMcpBridgeAgentTools } from '../mcp-bridge-extension';
import { TOOL_ALLOWLIST, isAllowedBridgeTool, validateParams } from '../tool-definitions';
import type { McpBridge } from '../../../mcp/mcp-bridge';
import { McpToolTimeoutError } from '../../../mcp/mcp-bridge';
import { McpServerNotRunningError } from '../../../types/server-types';

describe('MCP Bridge Extension', () => {
  describe('Tool Registration', () => {
    it('should register all defined tools', () => {
      expect(TOOLS.length).toBeGreaterThan(0);
      const toolNames = TOOLS.map(t => t.name);
      expect(toolNames).toContain('jira_get_issue');
      expect(toolNames).toContain('mem_search');
      expect(toolNames).toContain('mem_ingest');
      expect(toolNames).toContain('code_search');
      expect(toolNames).toContain('execute_dynamic_tool');
    });

    it('should have unique tool names', () => {
      const names = TOOLS.map(t => t.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });
  });

  describe('Execute Handler', () => {
    let mockBridge: McpBridge;
    let executeHandler: ReturnType<typeof createExecuteHandler>;

    beforeEach(() => {
      mockBridge = {
        callTool: vi.fn(),
      } as any;
      
      const schema = {
        required: ['issue_key'],
      };
      
      executeHandler = createExecuteHandler(mockBridge, 'jira_get_issue', schema);
    });

    it('STC: TC-002 - should call MCP wrapper with valid params', async () => {
      const mockResult = { key: 'SA4E-316', summary: 'Test' };
      (mockBridge.callTool as any).mockResolvedValue(mockResult);

      const result = await executeHandler('test-id', { issue_key: 'SA4E-316' });

      expect(mockBridge.callTool).toHaveBeenCalledWith('jira_get_issue', { issue_key: 'SA4E-316' });
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('SA4E-316');
      expect(result.details?.success).toBe(true);
    });

    it('STC: TC-101 - should return validation error for invalid params', async () => {
      const result = await executeHandler('test-id', {});

      expect(mockBridge.callTool).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('Validation failed');
      expect(result.details?.error).toBe('validation');
    });

    it('STC: TC-102 - should return structured error when MCP unreachable', async () => {
      (mockBridge.callTool as any).mockRejectedValue(new Error('MCP wrapper unavailable'));

      const result = await executeHandler('test-id', { issue_key: 'SA4E-316' });

      expect(result.content[0].text).toContain('Error invoking jira_get_issue');
      expect(result.content[0].text).toContain('MCP wrapper unavailable');
      expect(result.details?.error).toBe('mcp_error');
    });

    it('STC: TC-303 - should return content array with type text', async () => {
      (mockBridge.callTool as any).mockResolvedValue({ ok: true });

      const result = await executeHandler('test-id', { issue_key: 'SA4E-316' });

      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
    });

    it('STC: TC-304 - should propagate errors not swallow', async () => {
      const originalError = 'Original MCP error';
      (mockBridge.callTool as any).mockRejectedValue(new Error(originalError));

      const result = await executeHandler('test-id', { issue_key: 'SA4E-316' });

      expect(result.content[0].text).toContain('jira_get_issue');
      expect(result.content[0].text).toContain(originalError);
    });
  });

  describe('SEC-324-03 - bridge allowlist and dynamic-chaining deny', () => {
    let mockBridge: McpBridge;

    beforeEach(() => {
      mockBridge = { callTool: vi.fn().mockResolvedValue({ ok: true }) } as any;
    });

    it('allowlist contains the concrete tools but not execute_dynamic_tool', () => {
      expect(isAllowedBridgeTool('jira_get_issue')).toBe(true);
      expect(isAllowedBridgeTool('mem_search')).toBe(true);
      expect(isAllowedBridgeTool('code_search')).toBe(true);
      expect(isAllowedBridgeTool('execute_dynamic_tool')).toBe(false);
      expect(TOOL_ALLOWLIST.has('execute_dynamic_tool')).toBe(false);
    });

    it('denies execute_dynamic_tool by default (no opt-in)', async () => {
      const handler = createExecuteHandler(mockBridge, 'execute_dynamic_tool', { required: ['tool_name'] });
      const result = await handler('id-1', { tool_name: 'code_search', arguments: {} });
      expect(mockBridge.callTool).not.toHaveBeenCalled();
      expect(result.details?.error).toBe('chaining_denied');
    });

    it('denies non-allowlisted chained targets even with opt-in', async () => {
      const handler = createExecuteHandler(
        mockBridge, 'execute_dynamic_tool', { required: ['tool_name'] }, { allowDynamicChaining: true },
      );
      const result = await handler('id-2', { tool_name: 'shell_execute', arguments: {} });
      expect(mockBridge.callTool).not.toHaveBeenCalled();
      expect(result.details?.error).toBe('chaining_denied');
    });

    it('allows allowlisted chained targets with opt-in', async () => {
      const handler = createExecuteHandler(
        mockBridge, 'execute_dynamic_tool', { required: ['tool_name'] }, { allowDynamicChaining: true },
      );
      const result = await handler('id-3', { tool_name: 'code_search', arguments: { query: 'x' } });
      expect(mockBridge.callTool).toHaveBeenCalledWith(
        'execute_dynamic_tool', { tool_name: 'code_search', arguments: { query: 'x' } },
      );
      expect(result.details?.success).toBe(true);
    });

    it('routes approval-gated tools through the approval hook and audits', async () => {
      const audit: any[] = [];
      const handler = createExecuteHandler(
        mockBridge, 'mem_ingest', { required: ['content'] },
        { approvalHook: async () => false, auditLog: (e) => audit.push(e) },
      );
      expect(bridgeRequiresApproval('mem_ingest')).toBe(true);
      const result = await handler('id-4', { content: 'hello' });
      expect(mockBridge.callTool).not.toHaveBeenCalled();
      expect(result.details?.error).toBe('approval_denied');
      expect(audit).toEqual([{ toolName: 'mem_ingest', argKeys: ['content'], decision: 'denied' }]);
    });

    it('audits auto-approved read-only tools without param values', async () => {
      const audit: any[] = [];
      const handler = createExecuteHandler(
        mockBridge, 'code_search', { required: ['query'] }, { auditLog: (e) => audit.push(e) },
      );
      await handler('id-5', { query: 'budget' });
      expect(audit).toEqual([{ toolName: 'code_search', argKeys: ['query'], decision: 'auto-approved' }]);
    });

    it('validateParams rejects non-objects and oversized strings', () => {
      expect(validateParams({ required: [] }, null as any).valid).toBe(false);
      expect(validateParams({ required: [] }, 'x' as any).valid).toBe(false);
      expect(validateParams({ required: [] }, { q: 'x'.repeat(4001) }).valid).toBe(false);
      expect(validateParams({ required: ['query'] }, { query: 'ok' }).valid).toBe(true);
    });
  });
});

/** Test-side view of the built AgentTool (execute positional args match the handler). */
type BuiltTool = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (id: string, params: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    details?: Record<string, unknown>;
  }>;
};
const asTools = (tools: unknown): BuiltTool[] => tools as BuiltTool[];

describe('buildMcpBridgeAgentTools (SA4E-364)', () => {
  const CONCRETE = ['jira_get_issue', 'mem_search', 'mem_ingest', 'code_search'];
  let mockBridge: McpBridge;

  beforeEach(() => {
    mockBridge = { callTool: vi.fn() } as any;
  });

  // STC: UT-01 — default build returns exactly the 4 concrete bridge tools.
  it('UT-01: default build returns exactly the 4 concrete bridge tools', () => {
    const tools = asTools(buildMcpBridgeAgentTools(mockBridge));
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name).sort())
      .toEqual(['code_search', 'jira_get_issue', 'mem_ingest', 'mem_search']);
  });

  // STC: UT-02 — AgentTool shape; parameters/label/description passed THROUGH
  // from TOOLS (same reference — BR-01 single source of truth, no clone).
  it('UT-02: AgentTool shape with schema passthrough (same reference) from TOOLS', () => {
    const tools = asTools(buildMcpBridgeAgentTools(mockBridge));
    for (const tool of tools) {
      const def = TOOLS.find((t) => t.name === tool.name)!;
      expect(def).toBeDefined();
      expect(typeof tool.execute).toBe('function');
      expect(tool.parameters).toBe(def.parameters); // toBe — same reference (BR-01)
      expect(tool.label).toBe(def.label);
      expect(tool.description).toBe(def.description);
    }
    expect(tools.find((t) => t.name === 'mem_search')?.label).toBe('Memory Search');
  });

  // STC: UT-03 — execute success via bridge + audit auto-approved, no param leak.
  it('UT-03: mem_search executes via bridge; audit auto-approved without param values', async () => {
    const audit = vi.fn();
    (mockBridge.callTool as any).mockResolvedValue('KB results: personalized rules -> proven patterns');
    const tools = asTools(buildMcpBridgeAgentTools(mockBridge, { auditLog: audit }));
    const memSearch = tools.find((t) => t.name === 'mem_search')!;
    const result = await memSearch.execute('id-1', { query: 'personalized rules', limit: 5 });
    expect(mockBridge.callTool).toHaveBeenCalledTimes(1);
    expect(mockBridge.callTool).toHaveBeenCalledWith('mem_search', { query: 'personalized rules', limit: 5 });
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('personalized rules');
    expect(result.details).toMatchObject({ success: true, toolName: 'mem_search' });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toEqual({
      toolName: 'mem_search', argKeys: ['query', 'limit'], decision: 'auto-approved',
    });
    expect(JSON.stringify(audit.mock.calls[0][0])).not.toContain('personalized rules');
  });

  // STC: UT-11 — AC-3 default: NO dynamic tool in the BUILT registry.
  // ⚠️ Assert target is the build output (tool registry) — NOT the session-host
  // allowlist string array: DISCOVERY_TOOLS (tool-loadout.ts:18) always keeps
  // the NAME execute_dynamic_tool there even when the tool is not registered.
  it('UT-11: AC-3 default options — execute_dynamic_tool absent from the built registry', () => {
    const tools = asTools(buildMcpBridgeAgentTools(mockBridge));
    expect(tools.map((t) => t.name)).not.toContain('execute_dynamic_tool');
    expect(tools.map((t) => t.name).sort())
      .toEqual(['code_search', 'jira_get_issue', 'mem_ingest', 'mem_search']);
  });

  // STC: UT-12 — AC-3 opt-in semantics: only `=== true` registers the dynamic tool.
  it('UT-12: AC-3 opt-in allowDynamicChaining===true adds the dynamic tool (5 tools)', () => {
    const opted = asTools(buildMcpBridgeAgentTools(mockBridge, { allowDynamicChaining: true }));
    expect(opted).toHaveLength(5);
    expect(opted.map((t) => t.name)).toContain('execute_dynamic_tool');
    // Non-true values must NOT opt in (guard is `!== true`, exact semantics).
    for (const notTrue of [false, 0, undefined]) {
      const names = asTools(buildMcpBridgeAgentTools(mockBridge, { allowDynamicChaining: notTrue as never }))
        .map((t) => t.name);
      expect(names).not.toContain('execute_dynamic_tool');
      expect(names).toHaveLength(4);
    }
  });

  // STC: UT-13 — AC-4/EC-5: server stopped → exact error text; promise RESOLVES.
  it('UT-13: McpServerNotRunningError → exact fail-safe error text, no throw (EC-5)', async () => {
    (mockBridge.callTool as any).mockRejectedValue(new McpServerNotRunningError());
    const tools = asTools(buildMcpBridgeAgentTools(mockBridge));
    const memSearch = tools.find((t) => t.name === 'mem_search')!;
    const result = await memSearch.execute('id-2', { query: 'personalized rules' });
    expect(result.content[0].text).toBe('Error invoking mem_search: MCP Server is not running.');
    expect(result.details).toMatchObject({ error: 'mcp_error', toolName: 'mem_search' });
  });

  // STC: UT-14 — EC-2 validation: missing required / 4001 chars fail; 4000 passes;
  // validation failures audit NOTHING (fail happens before the approval step).
  it('UT-14: validation failures (EC-2) — boundary 4000/4001 + no audit on failure', async () => {
    const audit = vi.fn();
    const tools = asTools(buildMcpBridgeAgentTools(mockBridge, { auditLog: audit }));
    const memSearch = tools.find((t) => t.name === 'mem_search')!;
    const missing = await memSearch.execute('id-3', {});
    expect(missing.content[0].text).toMatch(/^Validation failed: /);
    expect(missing.details?.error).toBe('validation');
    const oversized = await memSearch.execute('id-4', { query: 'x'.repeat(4001) });
    expect(oversized.content[0].text).toMatch(/^Validation failed: /);
    expect(mockBridge.callTool).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled(); // fails BEFORE approval → no audit (EC-2)
    const boundary = await memSearch.execute('id-5', { query: 'x'.repeat(4000) });
    expect(mockBridge.callTool).toHaveBeenCalledTimes(1); // 4000 chars passes validation
    expect(boundary.details?.success).toBe(true);
    expect(audit).toHaveBeenCalledTimes(1); // the passing call audits as usual
  });

  // STC: UT-15 — EC-4 approval hook denies + audit 'denied' (no param values).
  it('UT-15: approvalHook false → approval_denied text + audited denial (EC-4)', async () => {
    const audit = vi.fn();
    const tools = asTools(buildMcpBridgeAgentTools(mockBridge, {
      approvalHook: async () => false,
      auditLog: audit,
    }));
    const memIngest = tools.find((t) => t.name === 'mem_ingest')!;
    const result = await memIngest.execute('id-6', { content: 'lesson learned text' });
    expect(result.content[0].text).toBe('Tool call denied by approval: mem_ingest');
    expect(result.details?.error).toBe('approval_denied');
    expect(mockBridge.callTool).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toEqual({
      toolName: 'mem_ingest', argKeys: ['content'], decision: 'denied',
    });
    expect(JSON.stringify(audit.mock.calls[0][0])).not.toContain('lesson learned text');
  });

  // STC: UT-16 — EC-6/EC-7 timeout + generic errors → error text; turn stays alive.
  // Note: the actual McpToolTimeoutError message carries no trailing dot
  // (mcp-bridge.ts:179) — the handler passes err.message verbatim (EC-7 style).
  it('UT-16: timeout and generic bridge errors → error text without throwing (EC-6/EC-7)', async () => {
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

  // STC: UT-17 — EC-1 defense-in-depth: the handler itself denies a non-opt-in
  // dynamic call even if the tool somehow got registered/called.
  it('UT-17: execute_dynamic_tool handler without opt-in → chaining_denied (EC-1)', async () => {
    const audit = vi.fn();
    const handler = createExecuteHandler(
      mockBridge, 'execute_dynamic_tool', { required: ['tool_name'] }, { auditLog: audit },
    );
    const result = await handler('id-9', { tool_name: 'code_search', arguments: { query: 'x' } });
    expect(result.content[0].text)
      .toBe('Dynamic tool chaining is disabled: execute_dynamic_tool requires explicit opt-in');
    expect(result.details).toMatchObject({ error: 'chaining_denied', toolName: 'execute_dynamic_tool' });
    expect(audit.mock.calls[0][0]).toEqual({
      toolName: 'execute_dynamic_tool', argKeys: [], decision: 'denied',
    });
    expect(mockBridge.callTool).not.toHaveBeenCalled();
  });

  // STC: UT-18 — EC-3: opted in but the chained target is outside TOOL_ALLOWLIST.
  it('UT-18: opted-in dynamic call with non-allowlisted target → chaining_denied (EC-3)', async () => {
    const audit = vi.fn();
    const handler = createExecuteHandler(
      mockBridge, 'execute_dynamic_tool', { required: ['tool_name'] },
      { allowDynamicChaining: true, auditLog: audit },
    );
    const denied = await handler('id-10', { tool_name: 'shell_execute', arguments: {} });
    expect(denied.content[0].text).toBe("Dynamic tool chaining denied: 'shell_execute' is not allowlisted");
    expect(denied.details).toMatchObject({
      error: 'chaining_denied', toolName: 'execute_dynamic_tool', target: 'shell_execute',
    });
    expect(audit.mock.calls[0][0].decision).toBe('denied');
    // Control: an allowlisted chained target passes through to the bridge.
    const allowed = await handler('id-11', { tool_name: 'mem_ingest', arguments: { content: 'x' } });
    expect(mockBridge.callTool).toHaveBeenCalledWith(
      'execute_dynamic_tool', { tool_name: 'mem_ingest', arguments: { content: 'x' } },
    );
    expect(allowed.details?.success).toBe(true);
  });

  // STC: PBT-01 — property: EVERY options combination builds a consistent
  // registry (never throws, always the 4 concrete tools, dynamic iff opt-in,
  // unique names, zero network during the build — N-6).
  it('PBT-01: property — all option combos build a consistent registry (no throw, no network)', () => {
    const optionsArb = fc.record({
      allowDynamicChaining: fc.option(fc.boolean({ noNaN: true }), { nil: undefined }),
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
        expect(names.includes('execute_dynamic_tool')).toBe(allowDynamicChaining === true);
        expect(new Set(names).size).toBe(names.length); // unique (BR-1)
        expect(callTool).not.toHaveBeenCalled(); // 0 network during build (N-6)
      }),
      { numRuns: 200 },
    );
  });
});
