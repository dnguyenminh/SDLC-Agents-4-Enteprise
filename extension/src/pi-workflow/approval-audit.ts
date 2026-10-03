/**
 * SA4E-335 follow-up — shared approval-branch plumbing (SEC-05 audit + pend).
 *
 * Extracted from powershell-approval-branch.ts so the PowerShell and bash
 * branches emit the IDENTICAL audit record and share one pend implementation
 * (DRP/SRP). Behavior is unchanged: same hash, same debugLog format, same
 * approval-gate resolution semantics.
 */
import * as crypto from 'node:crypto';
import { z } from 'zod';
import { debugLog } from '../debug-logger';
import { ToolApprovalGate } from '../chat/engine/ToolApprovalGate';
import type { AutopilotMode } from '../chat-panel/message-protocol';

/** Audit sentinel when a command matched neither destructive nor safe allowlist. */
export const NO_SAFE_MATCH_PENDED = 'NO_SAFE_MATCH_PENDED';

/** SEC-08: a shell tool's approval input must carry a string `command`. */
export const SHELL_INPUT_SCHEMA = z.object({ command: z.string() });

export interface GateResult {
  approved: boolean;
  reason?: string;
}

export interface BranchDeps {
  approvalGate: ToolApprovalGate;
  onApprovalPending?: (toolName: string, toolUseId: string) => void;
  getMode?: () => AutopilotMode;
}

/** Short, non-reversible hash of the command for audit without logging secrets (SEC-05). */
export function hashCommand(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/** Emit the structured tool_approval audit record (SEC-05, TDD §9.1). */
export function auditDecision(
  toolName: string,
  decision: 'auto-approve' | 'require-approval',
  matchedPattern: string,
  mode: AutopilotMode,
  rawCommand: string
): void {
  debugLog(
    `[PiWorkflowGate] tool_approval ` +
    `event=tool_approval tool=${toolName} decision=${decision} ` +
    `mode=${mode} matchedPattern=${matchedPattern} ` +
    `commandHash=${hashCommand(rawCommand)} commandLength=${rawCommand.length}`
  );
}

/** Ask the user via the real ToolApprovalGate and map the result. */
export async function pend(
  deps: BranchDeps,
  toolName: string,
  toolUseId: string,
  fallbackReason: string
): Promise<GateResult> {
  try {
    deps.onApprovalPending?.(toolName, toolUseId);
  } catch {
    // Notification must never break the gate.
  }
  const result = await deps.approvalGate.requestApproval(toolUseId);
  const decision = (result as { decision?: string })?.decision;
  if (decision === 'approve') return { approved: true };
  return { approved: false, reason: (result as { reason?: string })?.reason || fallbackReason };
}

/**
 * Resolve a shell command string from the approval request input (SEC-08).
 * Returns null when the input does not carry a valid string `command`.
 * @param input raw approval-request input object
 */
export function resolveShellCommand(input: unknown): string | null {
  const parsed = SHELL_INPUT_SCHEMA.safeParse(input);
  return parsed.success ? parsed.data.command : null;
}
