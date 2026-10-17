/**
 * TurnBudgetGuard — circuit breaker for runaway agent turns (UAT: model
 * called the same failing `find` 40+ times, filling an 8k window).
 * Pure logic (no pi/vscode imports) so it is fully unit-testable.
 *
 * Design note (UAT feedback): fixed TOTAL call budgets are the wrong
 * yardstick — legit long tasks need many calls. The loop signature is
 * REPETITION: the same request again and again. So the guard trips on
 * signature repeats (configurable N):
 * - identical tool+args (raw signature);
 * - SA4E-368: file-identity tools (read/ls) are keyed on their TARGET
 *   instead — the UAT "review all files" loop re-read the same files with
 *   varying offset/limit for 162 calls without ever repeating the exact
 *   args (sweep tools grep/find stay on the raw ladder: same pattern over
 *   different paths is legitimate exploration);
 * - identical failure signatures (tool + first error line, Bug I);
 * - identical completed assistant text blocks (perseveration).
 * plus a wall-clock timeout backstop. First trip wins.
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
/** Kind of the most recent steer/abort trip (SA4E-368). */
export type TripKind = 'identical' | 'reread';

/**
 * File-identity tools whose arguments identify ONE concrete target (a file
 * path / a directory listing). Re-reading the SAME target is the "review all
 * files" loop signature (SA4E-368 UAT: the model re-read the same files with
 * varying offset/limit for 162 calls before the guard caught it).
 *
 * Deliberately EXCLUDES sweep tools (grep/find): re-running the same pattern
 * over DIFFERENT paths is legitimate repo-wide exploration, not a loop —
 * those stay on the identical-args ladder.
 */
const READ_TARGET_TOOLS = new Set(['read', 'ls']);

/** Stable exploration target of a read-class tool call (object args). */
export function readTargetOfArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const a = args as Record<string, unknown>;
  const t = a.file_path ?? a.path ?? a.pattern ?? a.glob;
  return typeof t === 'string' ? t.trim().slice(0, 200) : '';
}

/** readTargetOfArgs over a JSON args string; junk tolerated (returns ''). */
export function extractReadTarget(argsJson: string): string {
  if (!argsJson) return '';
  try {
    return readTargetOfArgs(JSON.parse(argsJson));
  } catch {
    return '';
  }
}

export class TurnBudgetGuard {
  private totalCalls = 0;
  private perSignature = new Map<string, number>();
  private steered = new Set<string>();
  private timer?: ReturnType<typeof setTimeout>;
  private reason?: StopReason;
  private tripKind: TripKind | undefined;
  private tripTarget: string | undefined;

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

  /** Kind of the most recent steer/abort trip — 'reread' for read-target repeats. */
  get lastTripKind(): TripKind | undefined {
    return this.tripKind;
  }

  /** Exploration target of the most recent reread trip (undefined otherwise). */
  get lastTripTarget(): string | undefined {
    return this.tripTarget;
  }

  /** Observe one tool_execution_start; steer first, abort on persistence. */
  observeToolCall(name: string, argsJson: string): ObserveAction {
    if (this.reason) return 'abort';
    this.totalCalls++;
    // SA4E-368: for read-class tools, key repeats on the exploration TARGET
    // (file path / pattern), not the raw args — re-reading the same file with
    // a different offset/limit is still the same pointless call. This ladder
    // SUBSUMES the identical-args one for these tools (same args ⇒ same
    // target), so the raw signature is skipped when a target exists.
    if (READ_TARGET_TOOLS.has(name)) {
      const target = extractReadTarget(argsJson);
      if (target) {
        const action = this.observeSignature(`reread:${name}:${target}`);
        if (action !== 'ok') {
          this.tripKind = 'reread';
          this.tripTarget = target;
        }
        return action;
      }
    }
    const action = this.observeSignature(`tool:${name} ${(argsJson || '').slice(0, 300)}`);
    if (action !== 'ok') {
      this.tripKind = 'identical';
      this.tripTarget = undefined;
    }
    return action;
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
    const action = this.observeSignature(
      firstLine ? `fail:${name} ${firstLine}` : `fail:${name}`
    );
    if (action !== 'ok') {
      this.tripKind = 'identical';
      this.tripTarget = undefined;
    }
    return action;
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
    const action = this.observeSignature(`text:${norm.slice(0, 500)}[${norm.length}]`);
    if (action !== 'ok') {
      this.tripKind = 'identical';
      this.tripTarget = undefined;
    }
    return action;
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

  /**
   * Trip from an EXTERNAL detector (v1.53.7 stream repetition monitor): same
   * effects as an internal trip — reason recorded, onAbort fired, and the K2
   * suppression in collectResult applies (no second error bubble).
   */
  tripNow(reason: StopReason = 'repeat'): void {
    this.trip(reason);
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
      : `Stopped after repeating identical content despite correction (loop guard, ${totalCalls} calls total)`;
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
