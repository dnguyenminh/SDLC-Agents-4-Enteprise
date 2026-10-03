import { ToolApprovalGate } from '../chat/engine/ToolApprovalGate';
import { CommandPatternMatcher } from '../chat/engine/CommandPatternMatcher';
import { requiresApproval as isDestructiveTool } from '../chat/engine/ToolApprovalClassifier';
import type { AutopilotMode } from '../chat-panel/message-protocol';
import type { ToolApprovalGateHandler } from './approval-adapter.js';
import { evaluatePowerShellApproval } from './powershell-approval-branch.js';
import { evaluateBashDestructiveGuard } from './bash-approval-branch.js';

/**
 * Builds the real tool-approval gate handler (SEC-289-03, Fix J §5d).
 * Extracted from PiWorkflowAdapter to keep the adapter within the 200-line standard.
 *
 * Decision order:
 * 1. read-only tools (read/grep/find/ls/get_workspace_info) auto-approve — both
 *    modes; blocking them only stalls exploration.
 * 2. remembered command patterns auto-approve (user opted in via "Allow all").
 * 3. TRULY DESTRUCTIVE tools (ToolApprovalClassifier: delete_file, git_push,
 *    git_* …) ALWAYS block — even under Autopilot (Kiro semantics: destructive
 *    ops never run unattended).
 * 3b. bash command CONTENT gate (SA4E-335 / closes SEC-06): a destructive
 *    command (DESTRUCTIVE_BASH_PATTERNS) pends mode-independent, evaluated
 *    BEFORE the remembered-pattern branch. Non-destructive bash falls through.
 * 4. Autopilot mode auto-approves everything else (bash/write/edit — the user
 *    can revert; this was the UAT hang: every bash call pended an approval
 *    nobody was ever asked for because the mode was never wired in here).
 * 5. Supervised mode blocks and asks: onApprovalPending surfaces the Approve/
 *    Reject control, then the real ToolApprovalGate promise decides.
 *
 * Without a getMode() callback the handler defaults to SUPERVISED (fail-secure:
 * an unwired caller must not silently auto-approve).
 */
export function createToolApprovalGateHandler(
  approvalGate: ToolApprovalGate,
  commandPatternMatcher: CommandPatternMatcher,
  opts?: {
    onApprovalPending?: (toolName: string, toolUseId: string) => void;
    getMode?: () => AutopilotMode;
  }
): ToolApprovalGateHandler {
  return {
    requestApproval: async (req) => {
      const toolName = (req.toolName || '').toLowerCase();

      // --- PowerShell branch (SA4E-336, allowlist-of-safe — TDD v1.2 §3.2) ---
      // Gated by COMMAND CONTENT, not name-set membership. Fail-secure order:
      // destructive/unparseable pend FIRST (mode-independent, BR-11, SEC-04),
      // then positive safe-allowlist auto-approve (SEC-02), else deny-by-default
      // (pend). The branch ALWAYS returns explicitly — it never falls through to
      // the generic read-only / Autopilot path below. INVARIANT (SEC-04):
      // Remove-Item (and any DESTRUCTIVE_PS_PATTERNS match) can NEVER reach
      // {approved:true} via a read-only path, independent of step reordering.
      // 'powershell' is deliberately NOT in READ_ONLY_TOOLS (SEC-02).
      if (toolName === 'powershell') {
        return evaluatePowerShellApproval(req, {
          approvalGate,
          onApprovalPending: opts?.onApprovalPending,
          getMode: opts?.getMode,
        });
      }

      // --- bash content guard (SA4E-335 follow-up, closes SA4E-336 SEC-06) ---
      // Narrow fix: ONLY destructive command content is promoted to a
      // mode-independent pend (so `docker volume rm …` can never auto-approve
      // under Autopilot, and is caught BEFORE the remembered-pattern branch —
      // the exact sequence that wiped backend_postgres_data). Returning null
      // keeps the entire legacy path below untouched, so non-destructive bash
      // behavior is unchanged (TDD §7.2 / TC-15 / TC-16 remain valid).
      if (toolName === 'bash') {
        const guarded = await evaluateBashDestructiveGuard(req, {
          approvalGate,
          onApprovalPending: opts?.onApprovalPending,
          getMode: opts?.getMode,
        });
        if (guarded) return guarded;
      }

      if (READ_ONLY_TOOLS.has(toolName)) {
        return { approved: true, reason: 'Read-only tool auto-approved' };
      }
      if (commandPatternMatcher.matches(req.toolName)) {
        return { approved: true, reason: 'Matched auto-approve pattern' };
      }
      const destructive = isDestructiveTool(toolName);
      const mode: AutopilotMode = opts?.getMode?.() ?? 'supervised';
      if (mode === 'autopilot' && !destructive) {
        return { approved: true, reason: 'Autopilot: non-destructive tool auto-approved' };
      }
      // Supervised (or destructive under Autopilot): ask the user.
      try {
        opts?.onApprovalPending?.(req.toolName, req.toolUseId);
      } catch {
        // Notification must never break the gate.
      }
      const result = await approvalGate.requestApproval(req.toolUseId);
      const decision = (result as { decision?: string })?.decision;
      if (decision === 'approve') return { approved: true };
      return { approved: false, reason: (result as { reason?: string })?.reason || 'Rejected' };
    },
  };
}

/** Tools that only read — safe to run without interrupting the turn (both modes). */
const READ_ONLY_TOOLS = new Set(['read', 'grep', 'find', 'ls', 'get_workspace_info']);
