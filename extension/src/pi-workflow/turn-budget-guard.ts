/**
 * TurnBudgetGuard — circuit breaker for runaway agent turns (UAT: model
 * called the same failing `find` 40+ times, filling an 8k window).
 * Pure logic (no pi/vscode imports) so it is fully unit-testable.
 *
 * Design note (UAT feedback): fixed TOTAL call budgets are the wrong
 * yardstick — legit long tasks need many calls. The loop signature is
 * REPETITION: the same request (tool + args) again and again. So the guard
 * trips only on identical-signature repeats (configurable N) plus a
 * wall-clock timeout backstop. First trip wins.
 *
 * Two-tier response (the owner decides via the returned action):
 * - 'steer': first time a signature repeats N times — correct course
 *   mid-loop WITHOUT killing the turn (agent.steer). Counter resets, so
 *   persisting after correction escalates to 'abort'.
 * - 'abort': same signature tripped again after a steer, or timeout.
 */
export interface TurnBudget {
  timeoutMs?: number;
  /** Steer (then abort on persistence) when one identical tool+args call repeats this many times. */
  maxSameToolRepeats?: number;
}

export const DEFAULT_MAX_SAME_TOOL_REPEATS = 4;
/**
 * Wall-clock timeout default: 0 = DISABLED (product decision — a turn must only
 * stop on REPETITION, never on elapsed time; a legit long task keeps running as
 * long as it keeps making new progress). Set a positive `timeoutMs` (e.g. via
 * `sdlcAgents.backend.chatTimeout`) to opt back into a wall-clock backstop.
 */
export const DEFAULT_TURN_TIMEOUT_MS = 0;
export const MIN_SAME_TOOL_REPEATS = 2;
export const MAX_SAME_TOOL_REPEATS_CAP = 20;
/** Assistant text blocks shorter than this never count (greetings, "OK"...). */
export const MIN_REPEAT_BLOCK_CHARS = 30;
/** Skip text scanning past this size (long outputs: tool guard still applies). */
const MAX_TEXT_SCAN_CHARS = 100_000;

export type StopReason = 'repeat' | 'timeout';
export type ObserveAction = 'ok' | 'steer' | 'abort';

export class TurnBudgetGuard {
  private totalCalls = 0;
  private perSignature = new Map<string, number>();
  private steered = new Set<string>();
  private timer?: ReturnType<typeof setTimeout>;
  private reason?: StopReason;

  constructor(
    private readonly budget: Required<TurnBudget>,
    private readonly onAbort: () => void
  ) {}

  static resolveDefaults(budget?: TurnBudget): Required<TurnBudget> {
    // timeoutMs >= 0 is honored verbatim (0 = wall-clock timeout DISABLED).
    // Only a non-finite / negative value falls back to the default (also 0).
    const timeoutMs =
      Number.isFinite(budget?.timeoutMs) && (budget?.timeoutMs as number) >= 0
        ? (budget?.timeoutMs as number)
        : DEFAULT_TURN_TIMEOUT_MS;
    const raw = budget?.maxSameToolRepeats;
    const maxSameToolRepeats =
      Number.isFinite(raw) && (raw as number) >= MIN_SAME_TOOL_REPEATS
        ? Math.min(raw as number, MAX_SAME_TOOL_REPEATS_CAP)
        : DEFAULT_MAX_SAME_TOOL_REPEATS;
    return { timeoutMs, maxSameToolRepeats };
  }

  get stoppedReason(): StopReason | undefined {
    return this.reason;
  }

  get stats(): { totalCalls: number } {
    return { totalCalls: this.totalCalls };
  }

  /** Observe one tool_execution_start; steer first, abort on persistence. */
  observeToolCall(name: string, argsJson: string): ObserveAction {
    if (this.reason) return 'abort';
    this.totalCalls++;
    return this.observeSignature(`tool:${name} ${(argsJson || '').slice(0, 300)}`);
  }

  /**
   * Observe a FAILED tool call (tool_execution_end + isError).
   * Signature = tool name + FIRST error line, so the same failure trips even
   * when the model varies the arguments (Bug I: 11× `dir /b <varying path>`
   * never matched the identical-args signature and burned the 120s timeout).
   * Same two-tier steer → abort ladder as observeToolCall.
   */
  observeToolFailure(name: string, errorText?: string): ObserveAction {
    if (this.reason) return 'abort';
    const firstLine =
      (errorText ?? '').split('\n')[0]?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '';
    return this.observeSignature(firstLine ? `fail:${name} ${firstLine}` : `fail:${name}`);
  }

  /**
   * Observe one completed assistant text block; same two-tier response.
   * Catches perseveration (same paragraph/fence printed N times) that no
   * tool-call counter can see. Short blocks never count.
   */
  observeTextBlock(block: string): ObserveAction {
    if (this.reason) return 'abort';
    const norm = block.replace(/\s+/g, ' ').trim();
    if (norm.length < MIN_REPEAT_BLOCK_CHARS) return 'ok';
    return this.observeSignature(`text:${norm.slice(0, 500)}[${norm.length}]`);
  }

  private observeSignature(sig: string): ObserveAction {
    const n = (this.perSignature.get(sig) ?? 0) + 1;
    this.perSignature.set(sig, n);
    if (n >= this.budget.maxSameToolRepeats) {
      if (this.steered.has(sig)) {
        this.trip('repeat');
        return 'abort';
      }
      this.steered.add(sig);
      this.perSignature.set(sig, 0);
      return 'steer';
    }
    return 'ok';
  }

  /**
   * Arm the wall-clock timeout; owner must call clear() when settled.
   * When `timeoutMs <= 0` the wall-clock backstop is DISABLED — the turn then
   * stops ONLY on repetition (identical tool/failure/text signatures). This is
   * the default: a long task that keeps making new progress is never cut off.
   */
  startTimeout(): void {
    this.clear();
    if (!(this.budget.timeoutMs > 0)) { return; } // disabled → repeat-guard only
    this.timer = setTimeout(() => this.trip('timeout'), this.budget.timeoutMs);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private trip(reason: StopReason): void {
    if (this.reason) return;
    this.reason = reason;
    try {
      this.onAbort();
    } catch {
      // Abort must never break event dispatch.
    }
  }
}

/** Human-readable stop note appended to partial results (never an error). */
export function buildStopNote(reason: StopReason, totalCalls: number): string {
  const base =
    reason === 'timeout'
      ? `Stopped after the turn timeout with ${totalCalls} tool calls`
      : `Stopped after repeating one identical tool call despite correction (loop guard, ${totalCalls} calls total)`;
  return (
    `\n\n> Stopped early: ${base}. Partial results above are complete. ` +
    `Narrow the scope (one folder at a time) or ask for a summary so far to continue.`
  );
}

/**
 * Split streamed assistant text into COMPLETED blocks only.
 * Fence-aware: lines inside an unclosed fence are never blocks, and a fence
 * becomes a block the moment it closes. A trailing unterminated block is
 * partial (still streaming) and excluded — callers diff by count, so the
 * returned array only ever grows by append.
 */
export function splitCompletedBlocks(text: string): string[] {
  if (!text || text.length > MAX_TEXT_SCAN_CHARS) return [];
  const lines = text.split('\n');
  const blocks: string[] = [];
  let cur: string[] = [];
  let inFence = false;
  const flush = () => {
    const block = cur.join('\n');
    cur = [];
    if (block.trim()) blocks.push(block);
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      cur.push(line);
      inFence = !inFence;
      if (!inFence) flush(); // closed fence = atomic completed block
      continue;
    }
    if (!inFence && trimmed === '') {
      flush();
      continue;
    }
    cur.push(line);
  }
  // Trailing cur without terminator is partial — intentionally dropped.
  return blocks;
}

/**
 * Mid-loop course correction for text perseveration (mirrors the tool-call
 * correction: name the stuck behavior, give the concrete alternative).
 */
export function buildTextSteerCorrection(repeatCount: number): string {
  return (
    `You are repeating identical content (seen ${repeatCount} times) — STOP restating it. ` +
    `Continue ONLY with new information. If exploration is stuck, call get_workspace_info ` +
    `once, then read specific existing files.`
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
    `existing files. If a path fails, re-list from the workspace root; never guess deeper nested paths.`
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

  if (toolName === 'powershell') {
    return (
      header +
      `PowerShell: use Get-ChildItem (ls), Get-Content (cat), Test-Path. ` +
      `Windows paths work as-is (c:\\... or c:/...). ` +
      `For file exploration prefer the ls/read/grep/find tools over powershell.`
    );
  }

  if (toolName === 'bash') {
    return (
      header +
      `If it is bash: the shell is POSIX Git Bash on Windows — use ls (never cmd syntax like ` +
      `dir /b) and forward-slash paths (c:/projects/...); backslashes are escape characters. ` +
      `For file exploration prefer the ls/read/grep/find tools over bash.`
    );
  }

  return header + `Read the error text and change approach.`;
}
