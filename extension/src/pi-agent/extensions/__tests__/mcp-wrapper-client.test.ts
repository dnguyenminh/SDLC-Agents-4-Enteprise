/**
 * Unit tests for MCP Wrapper Client
 * SA4E-316
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpWrapperClient } from '../mcp-wrapper-client';

describe('McpWrapperClient', () => {
  let client: McpWrapperClient;
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    client = new McpWrapperClient('http://127.0.0.1:9181/mcp');
  });

  it('STC: TC-002 - should call MCP wrapper with correct payload', async () => {
    const mockResponse = {
      jsonrpc: '2.0',
      result: { key: 'SA4E-316' },
      id: 1,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await client.callMcpWrapper('jira_get_issue', { issue_key: 'SA4E-316' });

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:9181/mcp', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
    
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('jira_get_issue');
    expect(body.params.arguments).toEqual({ issue_key: 'SA4E-316' });
    
    expect(result).toEqual({ key: 'SA4E-316' });
  });

  it('STC: TC-102 - should throw structured error when MCP unreachable', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
    });

    await expect(client.callMcpWrapper('jira_get_issue', { issue_key: 'SA4E-316' }))
      .rejects.toThrow('MCP wrapper unavailable');
  });

  it('STC: TC-203 - should propagate MCP error message', async () => {
    const mockResponse = {
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal error' },
      id: 1,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    await expect(client.callMcpWrapper('jira_get_issue', { issue_key: 'SA4E-316' }))
      .rejects.toThrow('MCP error for tool jira_get_issue');
  });
});
