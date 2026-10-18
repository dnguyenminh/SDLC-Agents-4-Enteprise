/**
 * Human-readable stop notes + mid-loop steer corrections for the turn loop
 * guard. Extracted verbatim from turn-budget-guard.ts (BR-18 file-size split).
 */
import type { StopReason } from './budget-types.js';

/** Human-readable stop note appended to partial results (never an error). */
export function buildStopNote(reason: StopReason, totalCalls: number): string {
  const base =
    reason === 'timeout'
      ? `Stopped after the turn timeout with ${totalCalls} tool calls`
      : `Stopped after repeating identical content despite correction (loop guard, ${totalCalls} calls total)`;
  return (
    `\n\n> Stopped early: ${base}. Partial results above are complete. ` +
    `Narrow the scope (one folder at a time) or ask for a summary so far to continue.`
  );
}

/**
 * Appended to EVERY steer (UAT 17/10): the far end of the "review workspace"
 * run wrapped the turn up ("provide a comprehensive summary without further
 * retries") the moment a steer scolded it — a steer corrects ONE stuck call,
 * it is not a request to end the task.
 */
const STEER_NOT_TURN_END =
  ` This steer corrects ONE stuck call only — it is NOT a signal to end the turn. ` +
  `Continue with the remaining task and finish the requested scope.`;

/**
 * Mid-loop course correction for text perseveration (mirrors the tool-call
 * correction: name the stuck behavior, give the concrete alternative).
 * SA4E-368: for review/exploration loops the alternative must include the
 * SYNTHESIS escape hatch — "read more files" alone feeds the very loop it
 * is meant to break.
 */
export function buildTextSteerCorrection(repeatCount: number): string {
  return (
    `You are repeating identical content (seen ${repeatCount} times) — STOP restating it. ` +
    `Continue ONLY with new information: either read files you have NOT read yet, ` +
    `or deliver your findings from what you already have. ` +
    `If exploration is stuck, call get_workspace_info once, then read specific existing files. ` +
    `Never re-read a file you already read.` +
    STEER_NOT_TURN_END
  );
}

/**
 * Mid-loop correction for a RE-READ trip (SA4E-368): the model asked for the
 * same target again (possibly with varied args). Names the target and pushes
 * synthesis — deliberately does NOT suggest more exploration.
 */
export function buildRereadSteerCorrection(toolName: string, target: string, repeatCount: number): string {
  return (
    `You have already obtained '${target}' ${repeatCount} times this turn via ${toolName} — ` +
    `calling it again will not change the result. STOP re-reading '${target}'. ` +
    `Synthesize your answer from the results you already have; if something is missing, ` +
    `continue only with targets you have NOT read yet.` +
    STEER_NOT_TURN_END
  );
}

/**
 * Mid-loop course correction injected via agent.steer() on first repeat.
 * Names the stuck call and the concrete alternative (real layout first),
 * so a weak model can recover instead of dying at the abort line.
 */
export function buildSteerCorrection(toolName: string, repeatCount: number): string {
  return (
    `You have called ${toolName} with identical arguments ${repeatCount} times — ` +
    `the result will not change, STOP calling it. ` +
    `Instead: call get_workspace_info ONCE to see the real layout, then read specific ` +
    `existing files. If a path fails, re-list from the workspace root; never guess deeper nested paths.` +
    STEER_NOT_TURN_END
  );
}

/**
 * Mid-loop correction for a repeated identical FAILURE (Bug I): names the
 * stuck tool, explains the shell-dialect cause, and gives the concrete
 * alternative — fired when the same tool+error trips N times even if args vary.
 */
export function buildFailureSteerCorrection(toolName: string, repeatCount: number): string {
  // SA4E-336: shell-aware — PowerShell on win32, bash on non-win32.
  const header =
    `Tool '${toolName}' failed ${repeatCount} times with the same error — STOP retrying it; ` +
    `the result will not change. `;

  if (toolName === 'ls') {
    // v1.53.7 (UAT 17/10): the stuck call was `ls <file>` / `ls` off by one
    // level (file lived in __tests__/) repeated 5×. The error text alone
    // never said what to fix — name it explicitly.
    return (
      header +
      `ls guesses are usually off by ONE level: the target may sit in a subfolder (e.g. __tests__/) ` +
      `or may be a FILE. Use read for files; to find a path, list the PARENT folder, ` +
      `copy names exactly (including case), then retry with the full corrected path.` +
      STEER_NOT_TURN_END
    );
  }

  if (toolName === 'powershell') {
    return (
      header +
      `PowerShell: use Get-ChildItem (ls), Get-Content (cat), Test-Path. ` +
      `Windows paths work as-is (c:\\... or c:/...). ` +
      `For file exploration prefer the ls/read/grep/find tools over powershell.` +
      STEER_NOT_TURN_END
    );
  }

  if (toolName === 'bash') {
    return (
      header +
      `If it is bash: the shell is POSIX Git Bash on Windows — use ls (never cmd syntax like ` +
      `dir /b) and forward-slash paths (c:/projects/...); backslashes are escape characters. ` +
      `For file exploration prefer the ls/read/grep/find tools over bash.` +
      STEER_NOT_TURN_END
    );
  }

  return header + `Read the error text and change approach.` + STEER_NOT_TURN_END;
}
