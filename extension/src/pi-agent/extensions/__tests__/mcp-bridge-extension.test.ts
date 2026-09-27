/**
 * Unit tests for MCP Bridge Extension
 * SA4E-316
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExecuteHandler, TOOLS, bridgeRequiresApproval } from '../mcp-bridge-extension';
import { TOOL_ALLOWLIST, isAllowedBridgeTool, validateParams } from '../tool-definitions';
import type { McpBridge } from '../../../mcp/mcp-bridge';

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
