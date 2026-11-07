/**
 * AssistantRepetitionMonitor — stream-level breaker for degenerate generation.
 *
 * Root cause (UAT 17/10, run 19:12): after the last tool call the local model
 * fell into a generation loop and printed the same file-name pair (~120 chars)
 * ~500 times inside ONE paragraph — 71 KB streamed over ~11 minutes. The
 * block-perseveration scan (splitCompletedBlocks) can never see this: a
 * paragraph with no blank line is a single block and it never "repeats".
 *
 * Detection is pure and cheap: keep a bounded tail of the streamed text, and
 * on every push count how many times the LAST `unitChars` characters occur in
 * the tail. A model legitimately repeating a 64-char fragment 20+ times inside
 * a 20 KB window is not producing new content — that is degeneration, and the
 * turn should be stopped (partial output + stop note) instead of burning
 * minutes of generation.
 */
export interface RepetitionMonitorOptions {
  /** Max chars of streamed text kept for matching (default 20_000). */
  windowChars?: number;
  /** Probe length taken from the end of the stream (default 64). */
  unitChars?: number;
  /** Occurrences of the probe in the window that count as degeneration (default 20). */
  minRepeats?: number;
}

export const DEFAULT_REPETITION_WINDOW_CHARS = 20_000;
export const DEFAULT_REPETITION_UNIT_CHARS = 64;
export const DEFAULT_REPETITION_MIN_REPEATS = 20;

export class AssistantRepetitionMonitor {
  private buffer = '';
  private readonly windowChars: number;
  private readonly unitChars: number;
  private readonly minRepeats: number;

  constructor(options: RepetitionMonitorOptions = {}) {
    this.windowChars = clampInt(options.windowChars, 1_000, 200_000, DEFAULT_REPETITION_WINDOW_CHARS);
    this.unitChars = clampInt(options.unitChars, 16, 512, DEFAULT_REPETITION_UNIT_CHARS);
    this.minRepeats = clampInt(options.minRepeats, 3, 500, DEFAULT_REPETITION_MIN_REPEATS);
  }

  /** Feed one streamed text delta; true = degeneration detected (trip once). */
  push(delta: string): boolean {
    if (!delta) return false;
    this.buffer += delta;
    if (this.buffer.length > this.windowChars) {
      this.buffer = this.buffer.slice(-this.windowChars);
    }
    if (this.buffer.length < this.unitChars * this.minRepeats) return false;
    const probe = this.buffer.slice(-this.unitChars);
    // Non-overlapping occurrences: a single long run of one character (a wide
    // ASCII border) counts once per probe-length, not once per offset — this
    // keeps legit table/border output safe while real degeneration (hundreds
    // of identical fragments) is still caught immediately.
    let count = 0;
    let from = 0;
    for (;;) {
      const at = this.buffer.indexOf(probe, from);
      if (at === -1) break;
      count++;
      if (count >= this.minRepeats) return true;
      from = at + probe.length;
    }
    return false;
  }

  /**
   * CHAT-LOOP-CONT: the text BEFORE the degenerate tail — the "last coherent
   * point" anchor for the auto-continuation prompt. Walks backwards over the
   * trailing run of end-to-end (non-overlapping) probe occurrences and returns
   * the text preceding that run, clamped to `maxChars` from its end. A benign
   * earlier use of the same fragment survives (the walk stops at the first
   * occurrence that is not end-adjacent to the run).
   */
  uniqueTail(maxChars = 500): string {
    if (this.buffer.length < this.unitChars) return this.buffer;
    const probe = this.buffer.slice(-this.unitChars);
    let runStart = this.buffer.length - probe.length; // the final occurrence starts here
    let runLength = 1;
    let searchEnd = runStart - 1;
    while (searchEnd >= 0) {
      const at = this.buffer.lastIndexOf(probe, searchEnd);
      if (at === -1 || at + probe.length !== runStart) break; // trailing run ends here
      runStart = at;
      runLength++;
      searchEnd = at - 1;
    }
    // A lone trailing occurrence is not a loop — keep the whole buffer.
    if (runLength < 2) return this.buffer.length > maxChars ? this.buffer.slice(-maxChars) : this.buffer;
    const tail = this.buffer.slice(0, runStart);
    return tail.length > maxChars ? tail.slice(-maxChars) : tail;
  }

  /** Test/debug snapshot: current window length. */
  get windowLength(): number {
    return this.buffer.length;
  }
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const n = Math.trunc(value as number);
  return Math.min(Math.max(n, min), max);
}
