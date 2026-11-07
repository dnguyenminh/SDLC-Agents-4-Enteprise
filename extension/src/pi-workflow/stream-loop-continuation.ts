/**
 * CHAT-LOOP-CONT — stream-loop auto-continuation builders (pure, no imports).
 *
 * Root cause this serves (UAT: the "thinking block stops halfway" bug): a
 * degenerating stream prints the same fragment over and over until the model
 * hits the OUTPUT token limit (`finish_reason: "length"`), which settles the
 * turn SILENTLY — the thinking block just ends mid-sentence with no error and
 * no continuation. Degeneration is what burns the output budget fast, which
 * is why the stop always lands inside a repetition spiral.
 *
 * The fix contract (user decision): on a detected stream loop the degenerate
 * generation is ABORTED and ONE fresh continuation message is sent to the
 * SAME session — the turn CONTINUES instead of stopping. The continuation is
 * anchored on the model's own last coherent reasoning (monitor.uniqueTail) so
 * it resumes instead of restarting, and it explicitly forbids repeating the
 * loop. Bounded: at most `maxContinues` attempts per user turn (setting
 * `sdlcAgents.chat.streamLoopMaxContinues`, default 1); when exhausted the
 * turn ends with a VISIBLE stop notice — never a silent cut.
 */

/** Which streamed surface degenerated. */
export type StreamLoopKind = 'thinking' | 'answer';

export const DEFAULT_STREAM_LOOP_MAX_CONTINUES = 3;

/** Normalize a raw setting value into a safe attempt budget (>= 0, floored). */
export function normalizeStreamLoopMaxContinues(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_STREAM_LOOP_MAX_CONTINUES;
  return Math.min(Math.floor(n), 5);
}

/**
 * Markdown notice streamed to the webview between the aborted stream and the
 * continuation turn (`exhausted=true` when the continuation budget is spent —
 * the turn really ends here, visibly).
 */
export function buildLoopNoticeText(kind: StreamLoopKind, exhausted: boolean): string {
  const where = kind === 'thinking' ? 'Thinking' : 'Answer';
  return exhausted
    ? `_(⏹ ${where} loop detected — auto-continuation limit reached; stopped here. Narrow the request and retry.)_`
    : `_(↻ ${where} loop detected — auto-continuing with a fresh message…)_`;
}

/**
 * The continuation message sent to the SAME session after a loop abort.
 * `anchor` is the model's own last coherent reasoning (monitor.uniqueTail) —
 * it lets the model resume from where it stood, and the explicit "do NOT
 * repeat" instruction is what breaks the loop.
 */
export function buildLoopContinuationPrompt(kind: StreamLoopKind, anchor: string): string {
  const where = kind === 'thinking' ? 'reasoning' : 'answer';
  const trimmed = (anchor || '').trim();
  return [
    '[SYSTEM NOTE] Your previous response was interrupted because it fell into a repetition loop',
    '(the same fragment was printed over and over). Last coherent point of your ' + where + ':',
    '"""',
    trimmed.length > 0 ? trimmed : '(nothing coherent captured — restart this step concisely)',
    '"""',
    'Do NOT repeat that ' + where + '. If the task is too large for one response, break it into smaller steps and complete ONLY the next concrete action now — do not try to finish everything.',
    'Based on it, proceed directly: give your final answer or take the next concrete action now.',
  ].join('\n');
}

