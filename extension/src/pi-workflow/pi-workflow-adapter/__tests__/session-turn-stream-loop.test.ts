/**
 * CHAT-LOOP-CONT — the bounded stream-loop auto-continuation loop for the
 * session turn path (runStreamLoopTurn). Contract (user decision): on a
 * detected loop the degenerate run is ABORTED and a fresh continuation
 * message re-prompts the SAME session — the turn continues, never a silent
 * mid-sentence stop ("ngừng ngang").
 */
import { describe, it, expect, vi } from 'vitest';
import { runStreamLoopTurn, type LoopPromptTurnFn } from '../session-turn-stream-loop.js';
import type { StreamHandler } from '../../../mcp/stream-handler.js';

interface RecordedEvent {
  op: 'token' | 'thinking' | 'complete';
  content?: string;
  streamId: string;
}

/** Records emitToken/emitThinking/emitComplete without a real StreamHandler. */
function fakeStreamHandler(): StreamHandler & { events: RecordedEvent[] } {
  const events: RecordedEvent[] = [];
  return {
    events,
    emitToken: ((_nodeId: string, content: string, streamId: string) => {
      events.push({ op: 'token', content, streamId });
    }) as never,
    emitThinking: ((_nodeId: string, content: string, streamId: string) => {
      events.push({ op: 'thinking', content, streamId });
    }) as never,
    emitComplete: ((_nodeId: string, _duration: number, streamId: string) => {
      events.push({ op: 'complete', streamId });
    }) as never,
  } as never;
}

/** A degenerate 64-char fragment — trips the monitor's default threshold. */
const FRAG64 = 'peer-runtime-fragment-that-is-exactly-64-chars-long'.padEnd(64, 'x');

describe('runStreamLoopTurn (session path — thinking loop auto-continuation)', () => {
  it('aborts, notices, and re-prompts the SAME session with the anchor — turn continues', async () => {
    const prompts: string[] = [];
    const aborts = vi.fn();
    const handler = fakeStreamHandler();
    const promptTurn: LoopPromptTurnFn = vi.fn(async (text, onToken?, _onTool?, onThinking?) => {
      prompts.push(text);
      if (prompts.length === 1) {
        // Attempt 1: coherent start, then the degeneration spiral.
        onThinking?.('analyzing the peer runtime Map lifecycle ');
        for (let i = 0; i < 20; i++) onThinking?.(FRAG64);
        return { text: '', toolCalls: [], sessionFile: '/s.jsonl' }; // aborted-run settle
      }
      // Attempt 2 (continuation): the model recovers and answers.
      onToken?.('final answer');
      return { text: 'final answer', toolCalls: [], sessionFile: '/s.jsonl' };
    });

    const outcome = await runStreamLoopTurn<{ text: string }>({
      promptTurn,
      streamHandler: handler,
      initialPrompt: 'user question',
      firstStreamId: 'sid-1',
      maxContinues: 1,
      timeoutMs: 0,
      onToolEvent: () => undefined,
      abortActiveSession: aborts,
    });

    expect(outcome.kind).toBe('done');
    if (outcome.kind !== 'done') return;
    // The turn CONTINUED: two prompts, second is the anchored continuation.
    expect(promptTurn).toHaveBeenCalledTimes(2);
    expect(prompts[1]).toContain('[SYSTEM NOTE]');
    expect(prompts[1]).toContain('analyzing the peer runtime Map lifecycle');
    expect(prompts[1]).toContain('Do NOT repeat');
    // The degenerate run was aborted exactly once.
    expect(aborts).toHaveBeenCalledTimes(1);
    // VISIBLE, never silent: a notice was streamed between the two attempts.
    const notice = handler.events.find((e) => e.op === 'token' && e.content?.includes('auto-continuing'));
    expect(notice).toBeDefined();
    // Final result flows back + a fresh stream identity closed the turn.
    expect(outcome.res?.text).toBe('final answer');
    expect(outcome.finalStreamId).not.toBe('sid-1');
    expect(outcome.continuationPrompts).toHaveLength(1);
    expect(outcome.loopKinds).toEqual(['thinking']);
    // The final answer streamed on the continuation stream. The FINAL
    // emitComplete is the CALLER's job (it owns the non-streaming fallback),
    // so the helper's last event is the answer token itself.
    const lastEvent = handler.events[handler.events.length - 1];
    expect(lastEvent.op).toBe('token');
    expect(lastEvent.content).toBe('final answer');
    expect(lastEvent.streamId).toBe(outcome.finalStreamId);
  });

  it('ends with a VISIBLE stop notice when the continuation budget is exhausted', async () => {
    const aborts = vi.fn();
    const handler = fakeStreamHandler();
    const promptTurn: LoopPromptTurnFn = vi.fn(async (_text, _onToken?, _onTool?, onThinking?) => {
      onThinking?.('coherent start ');
      for (let i = 0; i < 20; i++) onThinking?.(FRAG64);
      return { text: '', toolCalls: [], sessionFile: '/s.jsonl' };
    });

    const outcome = await runStreamLoopTurn<{ text: string }>({
      promptTurn,
      streamHandler: handler,
      initialPrompt: 'q',
      firstStreamId: 'sid-1',
      maxContinues: 0, // budget disabled → degeneration ends the turn VISIBLY
      timeoutMs: 0,
      onToolEvent: () => undefined,
      abortActiveSession: aborts,
    });

    expect(outcome.kind).toBe('done');
    expect(promptTurn).toHaveBeenCalledTimes(1); // no continuation attempted
    expect(aborts).toHaveBeenCalledTimes(1);
    const stop = handler.events.find((e) => e.op === 'token' && e.content?.includes('limit reached'));
    expect(stop).toBeDefined();
  });

  it('images ride ONLY the first attempt (continuations are text-only)', async () => {
    const optsSeen: unknown[] = [];
    const handler = fakeStreamHandler();
    const promptTurn: LoopPromptTurnFn = vi.fn(async (text, _a?, _b?, onThinking?, opts?) => {
      optsSeen.push(opts);
      if (optsSeen.length === 1) {
        onThinking?.('start ');
        for (let i = 0; i < 20; i++) onThinking?.(FRAG64);
        return { text: '' };
      }
      return { text: 'recovered' };
    });

    await runStreamLoopTurn({
      promptTurn,
      streamHandler: handler,
      initialPrompt: 'q',
      firstStreamId: 'sid-1',
      firstAttemptOpts: { images: [{ data: 'abc', mimeType: 'image/png' }] },
      maxContinues: 1,
      timeoutMs: 0,
      onToolEvent: () => undefined,
      abortActiveSession: () => undefined,
    });

    expect(optsSeen[0]).toEqual({ images: [{ data: 'abc', mimeType: 'image/png' }] });
    expect(optsSeen[1]).toBeUndefined();
  });

  it('clean turns are untouched: single attempt, no notice, no abort', async () => {
    const aborts = vi.fn();
    const handler = fakeStreamHandler();
    const promptTurn: LoopPromptTurnFn = vi.fn(async (_text, onToken?) => {
      onToken?.('hello');
      return { text: 'hello', toolCalls: [], sessionFile: '/s.jsonl' };
    });

    const outcome = await runStreamLoopTurn<{ text: string }>({
      promptTurn,
      streamHandler: handler,
      initialPrompt: 'q',
      firstStreamId: 'sid-1',
      maxContinues: 1,
      timeoutMs: 0,
      onToolEvent: () => undefined,
      abortActiveSession: aborts,
    });

    expect(outcome.kind).toBe('done');
    if (outcome.kind !== 'done') return;
    expect(promptTurn).toHaveBeenCalledTimes(1);
    expect(aborts).not.toHaveBeenCalled();
    expect(outcome.finalStreamId).toBe('sid-1'); // same stream identity
    expect(outcome.sawToken).toBe(true);
    expect(handler.events.some((e) => e.content?.includes('loop'))).toBe(false);
  });

  it('per-attempt timeout resolves as timeout outcome (caller owns the UX)', async () => {
    const handler = fakeStreamHandler();
    const promptTurn: LoopPromptTurnFn = vi.fn(
      (_text, _a?, _b?, _c?, _d?) => new Promise<{ text: string }>(() => undefined) // never settles
    );

    const outcome = await runStreamLoopTurn<{ text: string }>({
      promptTurn,
      streamHandler: handler,
      initialPrompt: 'q',
      firstStreamId: 'sid-1',
      maxContinues: 1,
      timeoutMs: 25,
      onToolEvent: () => undefined,
      abortActiveSession: () => undefined,
    });

    expect(outcome.kind).toBe('timeout');
    if (outcome.kind !== 'timeout') return;
    expect(outcome.interruptedStreamId).toBe('sid-1');
  });
});
