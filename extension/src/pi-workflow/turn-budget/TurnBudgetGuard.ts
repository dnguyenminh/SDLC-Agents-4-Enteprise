/**
 * TurnBudgetGuard — circuit breaker for runaway agent turns (UAT: model
 * called the same failing `find` 40+ times, filling an 8k window).
 * Pure logic (no pi/vscode imports) — fully unit-testable.
 *
 * The loop signature is REPETITION, not total-call budgets (UAT feedback —
 * legit long tasks need many calls). Trips on signature repeats (N):
 * identical tool+args; SA4E-368: read/ls keyed on their TARGET (the "review
 * all files" loop re-read the same files with varying offset/limit for 162
 * calls; sweep tools grep/find stay on the raw ladder — same pattern over
 * different paths is legitimate exploration); identical failure signatures
 * (tool + first error line, Bug I); identical completed assistant text
 * blocks (perseveration); plus a wall-clock timeout backstop. First trip
 * wins.
 *
 * Two-tier response (the owner decides via the action) — 'steer': first
 * repeat of a signature N times corrects course mid-loop WITHOUT killing
 * the turn (agent.steer; counter resets, so persisting escalates); 'abort':
 * same signature again after a steer, or timeout.
 */
import {
  DEFAULT_MAX_SAME_TOOL_REPEATS,
  DEFAULT_TURN_TIMEOUT_MS,
  MAX_SAME_TOOL_REPEATS_CAP,
  MIN_REPEAT_BLOCK_CHARS,
  MIN_SAME_TOOL_REPEATS,
  type ObserveAction,
  type StopReason,
  type TripKind,
  type TurnBudget,
} from './budget-types.js';
import { READ_TARGET_TOOLS, extractReadTarget } from './read-target.js';

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
