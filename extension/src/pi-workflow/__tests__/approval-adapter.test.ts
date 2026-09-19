import { describe, it, expect, beforeEach } from 'vitest';
import { ApprovalAdapter, type ToolApprovalGateHandler } from '../approval-adapter.js';

describe('ApprovalAdapter (SA4E-294/295)', () => {
  it('should auto-approve when no gate handler is configured', async () => {
    const adapter = new ApprovalAdapter();
    const result = await adapter.processToolApproval({
      tool_use_id: 'tu-123',
      tool_name: 'search_kb',
      input: { query: 'test' }
    });

    expect(result.approved).toBe(true);
    expect(result.normalizedToolCall.id).toBe('tu-123');
    expect(result.normalizedToolCall.name).toBe('search_kb');
    expect(result.reason).toContain('Auto-approved');
  });

  it('should delegate approval to ToolApprovalGateHandler when provided', async () => {
    const mockHandler: ToolApprovalGateHandler = {
      async requestApproval(req) {
        if (req.toolName === 'danger_tool') {
          return { approved: false, reason: 'High risk' };
        }
        return { approved: true, modifiedInput: { ...req.input, safe: true } };
      }
    };

    const adapter = new ApprovalAdapter(mockHandler);

    const approvedResult = await adapter.processToolApproval({
      id: 'tc-1',
      name: 'safe_tool',
      arguments: { foo: 'bar' }
    });
    expect(approvedResult.approved).toBe(true);
    expect(approvedResult.normalizedToolCall.arguments).toEqual({ foo: 'bar', safe: true });

    const rejectedResult = await adapter.processToolApproval({
      id: 'tc-2',
      name: 'danger_tool',
      arguments: {}
    });
    expect(rejectedResult.approved).toBe(false);
    expect(rejectedResult.reason).toBe('High risk');
  });
});
