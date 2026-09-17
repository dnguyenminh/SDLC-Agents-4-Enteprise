import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PiWorkflowEngine } from '../pi-workflow';
import { ApprovalAdapter } from '../approval-adapter';
import { CheckpointerAdapter } from '../checkpointer-adapter';
import { StateAdapter } from '../state-adapter';

describe('PiWorkflowEngine approval decision flow', () => {
  let engine: PiWorkflowEngine;
  let approvalAdapter: ApprovalAdapter;
  let checkpointer: CheckpointerAdapter;

  beforeEach(() => {
    approvalAdapter = new ApprovalAdapter();
    checkpointer = new CheckpointerAdapter();
    const stateAdapter = new StateAdapter();
    engine = new PiWorkflowEngine(stateAdapter, approvalAdapter, checkpointer);
  });

  it('handleApprovalDecisionFromUI resolves decision and resumes with valid threadId', async () => {
    const threadId = '11111111-1111-4111-8111-111111111111';
    const toolCall = {
      tool_use_id: 'pi_abc',
      sessionId: 's1',
      ticketKey: 'SA4E-295',
      threadId,
    };
    const result = await approvalAdapter.requestApproval(toolCall);
    const extId = result.extensionId!;
    const state = {
      ticketKey: 'SA4E-295',
      threadId,
      currentPhase: 'design',
      pipelineStatus: 'paused' as const,
      piSessionId: 'sess',
      currentAgentId: null,
      toolCallCount: 0,
    };
    await checkpointer.save(state as any);

    const loadSpy = vi.spyOn(checkpointer, 'load');
    await engine.handleApprovalDecisionFromUI(extId, 'approve');
    expect(loadSpy).toHaveBeenCalledWith(threadId);
    const pending = approvalAdapter.getPendingApproval(extId);
    expect(pending).toBeUndefined();
    expect(approvalAdapter.getDecision('pi_abc', 's1')).toBe('approve');
  });

  it('handleApprovalDecisionFromUI warns when threadId missing', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const toolCall = {
      tool_use_id: 'pi_no_thread',
      sessionId: 's1',
      ticketKey: 'SA4E-295',
    };
    const result = await approvalAdapter.requestApproval(toolCall);
    const extId = result.extensionId!;
    await engine.handleApprovalDecisionFromUI(extId, 'reject');
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('Approval decision received without threadId'));
    consoleWarn.mockRestore();
  });
});
