/**
 * Unit tests for MCP Bridge Extension
 * SA4E-316
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExecuteHandler, TOOLS } from '../mcp-bridge-extension';
import { McpWrapperClient } from '../mcp-wrapper-client';

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
    let mockMcpClient: McpWrapperClient;
    let executeHandler: ReturnType<typeof createExecuteHandler>;

    beforeEach(() => {
      mockMcpClient = {
        callMcpWrapper: vi.fn(),
      } as any;
      
      const schema = {
        required: ['issue_key'],
      };
      
      executeHandler = createExecuteHandler(mockMcpClient, 'jira_get_issue', schema);
    });

    it('STC: TC-002 - should call MCP wrapper with valid params', async () => {
      const mockResult = { key: 'SA4E-316', summary: 'Test' };
      (mockMcpClient.callMcpWrapper as any).mockResolvedValue(mockResult);

      const result = await executeHandler('test-id', { issue_key: 'SA4E-316' });

      expect(mockMcpClient.callMcpWrapper).toHaveBeenCalledWith('jira_get_issue', { issue_key: 'SA4E-316' });
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('SA4E-316');
      expect(result.details?.success).toBe(true);
    });

    it('STC: TC-101 - should return validation error for invalid params', async () => {
      const result = await executeHandler('test-id', {});

      expect(mockMcpClient.callMcpWrapper).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('Validation failed');
      expect(result.details?.error).toBe('validation');
    });

    it('STC: TC-102 - should return structured error when MCP unreachable', async () => {
      (mockMcpClient.callMcpWrapper as any).mockRejectedValue(new Error('MCP wrapper unavailable'));

      const result = await executeHandler('test-id', { issue_key: 'SA4E-316' });

      expect(result.content[0].text).toContain('Error invoking jira_get_issue');
      expect(result.content[0].text).toContain('MCP wrapper unavailable');
      expect(result.details?.error).toBe('mcp_error');
    });

    it('STC: TC-303 - should return content array with type text', async () => {
      (mockMcpClient.callMcpWrapper as any).mockResolvedValue({ ok: true });

      const result = await executeHandler('test-id', { issue_key: 'SA4E-316' });

      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
    });

    it('STC: TC-304 - should propagate errors not swallow', async () => {
      const originalError = 'Original MCP error';
      (mockMcpClient.callMcpWrapper as any).mockRejectedValue(new Error(originalError));

      const result = await executeHandler('test-id', { issue_key: 'SA4E-316' });

      expect(result.content[0].text).toContain('jira_get_issue');
      expect(result.content[0].text).toContain(originalError);
    });
  });
});
