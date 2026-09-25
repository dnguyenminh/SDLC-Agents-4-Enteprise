import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerJiraIssueTools } from '../../../src/servers/atlassian/tools/jira-issue-tools';

describe('jira-issue-tools', () => {
  it('normalizes CRLF line endings to LF in description on update', async () => {
    const mockClient = {
      updateIssue: vi.fn().mockResolvedValue({ status: 204, data: undefined }),
      getIssue: vi.fn(),
      createIssue: vi.fn(),
      deleteIssue: vi.fn(),
      getIssueTypes: vi.fn(),
      getPriorities: vi.fn(),
      getStatuses: vi.fn(),
      getResolutions: vi.fn(),
    };

    const server = {
      registerTool: vi.fn((name, def, handler) => {
        if (name === 'jira_update_issue') {
          // Simulate tool invocation
          const args = {
            issue_key: 'SA4E-123',
            fields: {
              description: '## Heading\r\n- Parent\r\n  - Child\r\nReference SA4E-250\r',
            },
          };
          return handler(args, {});
        }
      }),
      tool: vi.fn(),
    } as unknown as McpServer;

    registerJiraIssueTools(server, mockClient as any);

    // Retrieve handler
    const [, , handler] = (server.registerTool as any).mock.calls.find(c => c[0] === 'jira_update_issue');
    await handler({
      issue_key: 'SA4E-123',
      fields: { description: '## Heading\r\n- Parent\r\n  - Child\r\nReference SA4E-250\r' },
    }, {});

    const calledFields = (mockClient.updateIssue as any).mock.calls[0][1];
    expect(calledFields.description).toBe('## Heading\n- Parent\n  - Child\nReference SA4E-250\n');
    // Verify LF only
    expect(calledFields.description).not.toContain('\r');
  });

  it('preserves description without CR', async () => {
    const mockClient = {
      updateIssue: vi.fn().mockResolvedValue({ status: 204, data: undefined }),
    };
    const server = {
      registerTool: vi.fn(),
      tool: vi.fn(),
    } as unknown as McpServer;

    registerJiraIssueTools(server, mockClient as any);
    const [, , handler] = (server.registerTool as any).mock.calls.find(c => c[0] === 'jira_update_issue');

    await handler({
      issue_key: 'SA4E-456',
      fields: { description: '# Title\n## Sub\n- Item' },
    }, {});

    const calledFields = (mockClient.updateIssue as any).mock.calls[0][1];
    expect(calledFields.description).toBe('# Title\n## Sub\n- Item');
  });

  it('normalizes CRLF in create issue description', async () => {
    const mockClient = {
      createIssue: vi.fn().mockResolvedValue({ status: 201, data: { key: 'SA4E-789' } }),
      updateIssue: vi.fn(),
      getIssue: vi.fn(),
      deleteIssue: vi.fn(),
      getIssueTypes: vi.fn(),
      getPriorities: vi.fn(),
      getStatuses: vi.fn(),
      getResolutions: vi.fn(),
    };

    const server = {
      registerTool: vi.fn(),
      tool: vi.fn(),
    } as unknown as McpServer;

    registerJiraIssueTools(server, mockClient as any);
    const [, , handler] = (server.registerTool as any).mock.calls.find(c => c[0] === 'jira_create_issue');

    await handler({
      project_key: 'SA4E',
      summary: 'Test',
      issue_type: 'Bug',
      description: '## Heading\r\n- Item\r',
    }, {});

    const calledBody = (mockClient.createIssue as any).mock.calls[0][0];
    expect(calledBody.fields.description).toBe('## Heading\n- Item\n');
    expect(calledBody.fields.description).not.toContain('\r');
  });
});
