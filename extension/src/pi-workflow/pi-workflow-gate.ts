import { ToolApprovalGate } from '../chat/engine/ToolApprovalGate';
import { CommandPatternMatcher } from '../chat/engine/CommandPatternMatcher';
import type { ToolApprovalGateHandler } from './approval-adapter.js';

/**
 * Builds the real tool-approval gate handler for PiWorkflowEngine (SEC-289-03).
 * Extracted from PiWorkflowAdapter to keep the adapter within the 200-line standard.
 *
 * Flow: auto-approve only on a user-stored command pattern; otherwise block on the
 * real ToolApprovalGate. Never silently auto-approves.
 */
export function createToolApprovalGateHandler(
  approvalGate: ToolApprovalGate,
  commandPatternMatcher: CommandPatternMatcher
): ToolApprovalGateHandler {
  return {
    requestApproval: async (req) => {
      if (commandPatternMatcher.matches(req.toolName)) {
        return { approved: true, reason: 'Matched auto-approve pattern' };
      }
      const result = await approvalGate.requestApproval(req.toolUseId);
      const decision = (result as { decision?: string })?.decision;
      if (decision === 'approve') return { approved: true };
      return { approved: false, reason: (result as { reason?: string })?.reason || 'Rejected' };
    },
  };
}
