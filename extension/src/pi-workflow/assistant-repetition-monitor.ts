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
