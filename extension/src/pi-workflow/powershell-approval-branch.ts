/**
 * SA4E-336 — PowerShell approval branch (allowlist-of-safe posture, TDD v1.2 §3.2).
 *
 * Extracted from pi-workflow-gate.ts so the gate stays within the 200-line
 * standard and the fail-secure decision logic is independently testable (SRP).
 *
 * Decision order (fail-secure, branch ALWAYS returns explicitly — SEC-04):
 *   Step 1  destructive OR not-statically-understandable → PEND (mode-independent, BR-11)
 *   Step 1b positive READONLY_PS_PATTERNS match          → auto-approve (SEC-02)
 *   Step 1c else (empty / unrecognized)                  → PEND (deny-by-default)
 *
 * SEC-05: every decision is audit-logged with mode + matched pattern/category
 * (or NO_SAFE_MATCH_PENDED) + command hash + length.
 * SEC-08: the request input is zod-validated; a missing/renamed/invalid
 * `command` on a shell tool fails secure (pend), never empty-safe auto-approve.
 *
 * Shared plumbing (audit record, pend, command resolution) lives in
 * approval-audit.ts — shared with the bash branch so both emit identical logs.
 */
import {
  DESTRUCTIVE_PS_PATTERNS,
  normalizePsCommand,
  isReadonlyPsCommand,
  matchedDestructiveCategory,
} from '../chat/engine/ToolApprovalClassifier';
import type { AutopilotMode } from '../chat-panel/message-protocol';
import {
  NO_SAFE_MATCH_PENDED,
  auditDecision,
  pend,
  resolveShellCommand,
  type BranchDeps,
  type GateResult,
} from './approval-audit.js';

/**
 * Evaluate the PowerShell approval decision (TDD v1.2 §3.2 Steps 1/1b/1c).
 * Always returns an explicit GateResult — never falls through (SEC-04).
 * @param req approval request (toolName/toolUseId/input)
 * @param deps gate dependencies (approvalGate + optional notify/getMode)
 */
export async function evaluatePowerShellApproval(
  req: { toolName: string; toolUseId: string; input: Record<string, unknown> },
  deps: BranchDeps
): Promise<GateResult> {
  const mode: AutopilotMode = deps.getMode?.() ?? 'supervised';

  // SEC-08: fail secure if `command` is missing / renamed / wrong-typed.
  const command = resolveShellCommand(req.input);
  if (command === null) {
    auditDecision(req.toolName, 'require-approval', NO_SAFE_MATCH_PENDED, mode, '');
    return pend(deps, req.toolName, req.toolUseId,
      'Malformed PowerShell approval input (missing command) requires approval (fail-secure)');
  }

  const norm = normalizePsCommand(command);

  // Step 1 [BR-11, SEC-03]: destructive OR not-understandable → PEND first, mode-independent.
  const destructiveCategory = matchedDestructiveCategory(norm.text);
  if (!norm.decoded || destructiveCategory) {
    const matched = destructiveCategory ?? 'UNDECODABLE_PENDED';
    auditDecision(req.toolName, 'require-approval', matched, mode, command);
    return pend(deps, req.toolName, req.toolUseId,
      'Destructive/unparseable PowerShell command requires approval');
  }

  // Step 1b [SEC-02]: auto-approve ONLY on a positive safe-allowlist match.
  if (isReadonlyPsCommand(norm.text)) {
    const cmdlet = norm.text.split(/\s+/)[0]?.toUpperCase() ?? '';
    auditDecision(req.toolName, 'auto-approve', `READONLY_${cmdlet}`, mode, command);
    return { approved: true, reason: 'Read-only PowerShell command auto-approved' };
  }

  // Step 1c [deny-by-default]: empty / unrecognized → PEND (fail-secure).
  auditDecision(req.toolName, 'require-approval', NO_SAFE_MATCH_PENDED, mode, command);
  return pend(deps, req.toolName, req.toolUseId,
    'Unrecognized PowerShell command requires approval (fail-secure)');
}

/** Shared sentinels/helpers kept exported for backwards compatibility. */
export { NO_SAFE_MATCH_PENDED, resolveShellCommand };

/** Re-exported so the gate can reference the canonical destructive list if needed. */
export { DESTRUCTIVE_PS_PATTERNS };
