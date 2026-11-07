/**
 * CHAT-LOOP-CONT — the bounded stream-loop auto-continuation loop for the
 * session turn path (mechanics: ../stream-loop-continuation.ts).
 *
 * Drives `host.promptTurn` in a bounded attempt loop. EVERY attempt wraps the
 * token/thinking callbacks with an AssistantRepetitionMonitor; on a trip the
 * degenerate run is aborted (via `abortActiveSession`), the truncated stream
 * is closed, a visible notice is streamed, and the NEXT attempt re-prompts
 * the SAME session with an anchor on the last coherent reasoning. When the
 * continuation budget is exhausted the turn ends with a visible stop notice —
 * the caller decides how to finish (non-streaming fallback + final complete).
 *
 * Extracted from adapter-session-turns.ts (BR-18 file-size split) so the
 * adapter keeps the timeout/budget-error handling at its own boundary.
 */
import * as crypto from 'node:crypto';
import { AssistantRepetitionMonitor } from '../assistant-repetition-monitor.js';
import {
  buildLoopContinuationPrompt,
  buildLoopNoticeText,
  type StreamLoopKind,
} from '../stream-loop-continuation.js';
import type { StreamHandler } from '../../mcp/stream-handler.js';

/** Minimal promptTurn shape this loop drives (structural — host type not imported). */
export type LoopPromptTurnFn = (
  text: string,
  onToken?: (t: string) => void,
  onToolEvent?: (e: never) => void,
  onThinking?: (t: string) => void,
  opts?: unknown
) => Promise<unknown>;

export interface StreamLoopTurnInput<T> {
  /** The session host's promptTurn (same host = same transcript). */
  promptTurn: LoopPromptTurnFn;
  /** Stream sink — token/thinking/complete all carry the attempt's streamId. */
  streamHandler: StreamHandler;
  /** Stream node id (default 'pi', matching the adapter's convention). */
  nodeId?: string;
  /** The user's prompt (attempt 1; continuation prompts are derived). */
  initialPrompt: string;
  /** Stream identity of attempt 1 (caller-generated, one per turn). */
  firstStreamId: string;
  /** Opaque promptTurn options for attempt 1 ONLY (images ride the user prompt). */
  firstAttemptOpts?: unknown;
  /** Continuation budget (normalized by the caller). */
  maxContinues: number;
  /** Wall-clock backstop per attempt (<= 0 disables — the product default). */
  timeoutMs: number;
  /** Live tool-event forwarder (adapter stamps the origin tab). */
  onToolEvent: (e: unknown) => void;
  /** Abort the in-flight run (session.abort) — settles promptTurn. */
  abortActiveSession: () => void;
}

export type StreamLoopOutcome<T> =
  | { kind: 'timeout'; /** Stream identity of the attempt the timeout claimed. */
      interruptedStreamId: string }
  | {
      kind: 'done';
      /** Final attempt's promptTurn result. */
      res: T | undefined;
      /** Whether the FINAL attempt streamed at least one answer token. */
      sawToken: boolean;
      /** Stream identity of the final attempt (callers complete with it). */
      finalStreamId: string;
      /** Continuation prompts issued (for the caller's history mirror). */
      continuationPrompts: string[];
      /** Every loop kind encountered, in order (observability/tests). */
      loopKinds: StreamLoopKind[];
    };

/**
 * Run the bounded attempt loop. Never throws for stream loops; a per-attempt
 * wall-clock timeout resolves as `{ kind: 'timeout' }` (the caller owns the
 * timeout UX — identical to the previous inline branch).
 */
export async function runStreamLoopTurn<T extends { text?: string }>(
  input: StreamLoopTurnInput<T>
): Promise<StreamLoopOutcome<T>> {
  const nodeId = input.nodeId ?? 'pi';
  const turnStart = Date.now();
  let promptText = input.initialPrompt;
  let streamId = input.firstStreamId;
  let attemptOpts: unknown = input.firstAttemptOpts;
  let continuesLeft = Math.max(0, Math.floor(input.maxContinues));
  const continuationPrompts: string[] = [];
  const loopKinds: StreamLoopKind[] = [];
  let lastRes: T | undefined;
  let lastSawToken = false;

  for (;;) {
    const thinkingMonitor = new AssistantRepetitionMonitor();
    const answerMonitor = new AssistantRepetitionMonitor();
    let loopKind: StreamLoopKind | undefined;
    let sawToken = false;
    let live = true;

    const promptPromise = input.promptTurn(
      promptText,
      (token) => {
        if (!live) return;
        sawToken = true;
        input.streamHandler.emitToken(nodeId, token, streamId);
        if (!loopKind && answerMonitor.push(token)) {
          loopKind = 'answer';
          live = false; // stop forwarding the degenerate run's events
          input.abortActiveSession(); // settles promptTurn; decision after the await
        }
      },
      (e) => {
        if (!live) return;
        input.onToolEvent(e);
      },
      (token) => {
        if (!live) return;
        input.streamHandler.emitThinking(nodeId, token, streamId);
        if (!loopKind && thinkingMonitor.push(token)) {
          loopKind = 'thinking';
          live = false;
          input.abortActiveSession();
        }
      },
      attemptOpts
    );

    let res: T | undefined;
    try {
      if (input.timeoutMs > 0) {
        const timeout = new Promise<never>((_, reject) => {
          const t = setTimeout(
            () => reject(new Error(`PI_SESSION_TIMEOUT after ${input.timeoutMs}ms`)),
            input.timeoutMs
          );
          (t as unknown as { unref?: () => void }).unref?.();
        });
        res = (await Promise.race([promptPromise, timeout])) as T;
      } else {
        res = (await promptPromise) as T;
      }
    } catch (err) {
      live = false;
      if ((err as Error).message.startsWith('PI_SESSION_TIMEOUT')) {
        return { kind: 'timeout', interruptedStreamId: streamId };
      }
      throw err;
    }

    if (!loopKind) {
      return { kind: 'done', res, sawToken, finalStreamId: streamId, continuationPrompts, loopKinds };
    }
    lastRes = res;
    lastSawToken = sawToken;
    loopKinds.push(loopKind);
    if (continuesLeft <= 0) break; // exhausted — caller emits the visible stop notice

    // Close the truncated stream so the webview settles the partial block,
    // surface WHAT happened (never silent), then re-prompt the SAME session
    // anchored on the last coherent point of the degenerated surface.
    continuesLeft--;
    input.streamHandler.emitComplete(nodeId, Date.now() - turnStart, streamId);
    emitLoopNotice(input.streamHandler, nodeId, loopKind, false);
    const anchor = (loopKind === 'thinking' ? thinkingMonitor : answerMonitor).uniqueTail(500);
    promptText = buildLoopContinuationPrompt(loopKind, anchor);
    continuationPrompts.push(promptText);
    attemptOpts = undefined; // images ride the user prompt only
    streamId = crypto.randomUUID(); // fresh stream identity for the continuation
  }

  // Continuation budget exhausted on a loop — the caller finishes the turn;
  // the final visible notice is emitted here so it always precedes the close.
  // The FINAL attempt's partial result still flows back (never dropped).
  emitLoopNotice(input.streamHandler, nodeId, loopKinds[loopKinds.length - 1] ?? 'thinking', true);
  return {
    kind: 'done',
    res: lastRes,
    sawToken: lastSawToken,
    finalStreamId: streamId,
    continuationPrompts,
    loopKinds,
  };
}

/** Stream a tiny self-contained notice stream (one token + its complete). */
function emitLoopNotice(
  handler: StreamHandler,
  nodeId: string,
  kind: StreamLoopKind,
  exhausted: boolean
): void {
  const noticeStreamId = crypto.randomUUID() + '-loop-notice';
  handler.emitToken(nodeId, buildLoopNoticeText(kind, exhausted), noticeStreamId);
  handler.emitComplete(nodeId, 0, noticeStreamId);
}
