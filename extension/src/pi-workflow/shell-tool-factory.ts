/**
 * SA4E-336 — OS-aware shell tool factory.
 *
 * Strategy pattern: picks the native shell tool per platform at creation time.
 *  - win32    → createPowerShellTool(workspaceRoot)  (NO shellPath — BR-07,
 *               0.99.1 self-resolves pwsh.exe → Windows PowerShell 5.1)
 *  - non-win32 → createBashTool(workspaceRoot)        (unchanged, BRD §1.2)
 *
 * createPowerShellToolSafe wraps PS creation with a fail-safe fallback to bash
 * (Circuit Breaker): if the PS factory is missing or throws, we degrade to bash
 * and log the posture change (SEC-10: command-content gate is powershell-only,
 * so the fallback disables it — the WARN must be greppable).
 *
 * Extracted from pi-coding-tools.ts to keep that file within the 200-line
 * standard (SRP).
 */
import { debugLog } from '../debug-logger';
import type { AgentTool } from '@earendil-works/pi-agent-core';

/** Dialect note prepended to the PowerShell tool description (win32). */
export const POWERSHELL_DIALECT_NOTE =
  'Shell is Windows PowerShell (pwsh) — NOT bash: use Get-ChildItem/ls, Get-Content/cat, ' +
  'Test-Path. Windows paths work as-is (c:\\... or c:/...) — no translation needed. ' +
  'Prefer the dedicated ls/read/grep/find tools over powershell for file exploration. ';

/** True on Windows, where the native PowerShell tool replaces the Git-Bash workaround. */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/** Attach the PowerShell dialect hint to the tool description (idempotent). */
export function withPowerShellDialectHint<T extends AgentTool>(tool: T): T {
  if (!tool.description || tool.description.includes('Windows PowerShell (pwsh)')) return tool;
  return { ...tool, description: POWERSHELL_DIALECT_NOTE + tool.description };
}

type PiCodingModule = typeof import('@earendil-works/pi-coding-agent');

/**
 * Safely create the native PowerShell tool, falling back to bash on failure.
 * BR-07: does NOT pass shellPath (0.99.1 self-resolves pwsh.exe).
 * SEC-10: on fallback, logs securityPosture=command-content-gate-disabled.
 * @param m resolved pi-coding-agent module
 * @param workspaceRoot absolute workspace root (cwd)
 * @returns the PowerShell tool, or a bash tool when PS is unavailable, or null
 */
export function createPowerShellToolSafe(
  m: PiCodingModule,
  workspaceRoot: string
): AgentTool | null {
  const factory = (m as { createPowerShellTool?: (cwd: string) => unknown }).createPowerShellTool;
  if (typeof factory === 'function') {
    try {
      const tool = factory(workspaceRoot) as AgentTool;
      debugLog(`[PiCodingTools] powershell_tool_created platform=win32 workspace=${workspaceRoot}`);
      return withPowerShellDialectHint(tool);
    } catch (err) {
      debugLog(
        `[PiCodingTools] powershell_fallback reason=${(err as Error).message} platform=win32 ` +
        `securityPosture=command-content-gate-disabled`
      );
    }
  } else {
    debugLog(
      `[PiCodingTools] powershell_fallback reason=factory-undefined platform=win32 ` +
      `securityPosture=command-content-gate-disabled`
    );
  }
  // Fallback to bash (default resolution — no shellPath on 0.99.1).
  try {
    return m.createBashTool(workspaceRoot) as unknown as AgentTool;
  } catch (err) {
    debugLog(`[PiCodingTools] bash fallback also failed: ${(err as Error).message}`);
    return null;
  }
}
