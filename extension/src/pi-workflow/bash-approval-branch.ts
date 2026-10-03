/**
 * SA4E-335 follow-up — bash destructive-command guard (closes SA4E-336 SEC-06).
 *
 * Extracted from pi-workflow-gate.ts so the gate stays within the 200-line
 * standard and the content check is independently testable (SRP).
 *
 * Decision contract:
 *   - destructive command content  → PEND, MODE-INDEPENDENT (SEC-06 closure, NFR8)
 *   - no / unrecognizable command  → return null (caller keeps the LEGACY path,
 *     so a malformed bash input never silently escalates or auto-approves)
 *   - non-destructive              → return null (caller keeps the LEGACY path:
 *     supervised pends, autopilot auto-approves — TDD §7.2 / TC-15 / TC-16)
 *
 * Returning `null` (rather than always returning a GateResult) is what makes
 * this a *narrow* fix: only the destructive exposure is removed, no other bash
 * behavior changes, so the SA4E-336 contract rows stay valid.
 *
 * SEC-05: the pend decision is audit-logged with mode + matched category +
 * command hash + length, identically to the PowerShell branch (shared plumbing
 * in approval-audit.ts).
 */
import {
  normalizeBashCommand,
  matchedDestructiveBashCategory,
} from '../chat/engine/ToolApprovalClassifier';
import type { AutopilotMode } from '../chat-panel/message-protocol';
import {
  auditDecision,
  pend,
  resolveShellCommand,
  type BranchDeps,
  type GateResult,
} from './approval-audit.js';

/** Audit marker used when the input carries no inspectable command. */
export const NO_BASH_COMMAND = 'NO_BASH_COMMAND';

/**
 * Evaluate the `bash` approval guard.
 * @returns a GateResult when the command is destructive (always a PEND),
 *          or `null` when the caller should continue with the generic gate.
 * @param req approval request (toolName/toolUseId/input)
 * @param deps gate dependencies (approvalGate + optional notify/getMode)
 */
export async function evaluateBashDestructiveGuard(
  req: { toolName: string; toolUseId: string; input: Record<string, unknown> },
  deps: BranchDeps
): Promise<GateResult | null> {
  const mode: AutopilotMode = deps.getMode?.() ?? 'supervised';

  const command = resolveShellCommand(req.input);
  if (command === null) {
    auditDecision(req.toolName, 'require-approval', NO_BASH_COMMAND, mode, '');
    return null;
  }

  const { text } = normalizeBashCommand(command);
  const category = matchedDestructiveBashCategory(text);
  if (category === null) return null;

  auditDecision(req.toolName, 'require-approval', category, mode, command);
  return pend(
    deps,
    req.toolName,
    req.toolUseId,
    'Destructive bash command requires approval (SA4E-335 command-content gate, closes SEC-06)'
  );
}
