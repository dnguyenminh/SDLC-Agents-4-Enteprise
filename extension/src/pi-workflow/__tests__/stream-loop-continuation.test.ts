/**
 * CHAT-LOOP-CONT — pure builders for the stream-loop auto-continuation.
 * Contract (user decision): on a detected stream loop the system does NOT stop
 * silently — it aborts the degenerate generation and creates ONE fresh
 * continuation message anchored on the model's own last coherent reasoning.
 */
import { describe, it, expect } from 'vitest';
import {
  buildLoopContinuationPrompt,
  buildLoopNoticeText,
  normalizeStreamLoopMaxContinues,
  DEFAULT_STREAM_LOOP_MAX_CONTINUES,
} from '../stream-loop-continuation.js';

describe('buildLoopContinuationPrompt (CHAT-LOOP-CONT)', () => {
  it('anchors the continuation on the last coherent reasoning and forbids repeating it', () => {
    const prompt = buildLoopContinuationPrompt('thinking', 'analyzing the peer runtime Map lifecycle');
    expect(prompt).toContain('[SYSTEM NOTE]');
    expect(prompt).toContain('repetition loop');
    expect(prompt).toContain('analyzing the peer runtime Map lifecycle');
    expect(prompt).toContain('Do NOT repeat that reasoning');
    expect(prompt).toContain('final answer');
  });

  it('works for the answer surface too', () => {
    const prompt = buildLoopContinuationPrompt('answer', 'the answer so far said X');
    expect(prompt).toContain('Do NOT repeat that answer');
    expect(prompt).toContain('the answer so far said X');
  });

  it('falls back to a restart hint when no coherent anchor exists (pure-loop buffer)', () => {
    const prompt = buildLoopContinuationPrompt('thinking', '');
    expect(prompt).toContain('(nothing coherent captured');
  });
});

describe('buildLoopNoticeText (CHAT-LOOP-CONT)', () => {
  it('announces the auto-continue while budget remains', () => {
    expect(buildLoopNoticeText('thinking', false)).toContain('auto-continuing');
    expect(buildLoopNoticeText('thinking', false)).toContain('Thinking loop');
  });

  it('announces a VISIBLE stop when the continuation budget is exhausted', () => {
    const notice = buildLoopNoticeText('answer', true);
    expect(notice).toContain('limit reached');
    expect(notice).toContain('stopped here');
  });
});

describe('normalizeStreamLoopMaxContinues', () => {
  it('defaults to 1 for unset/invalid values', () => {
    expect(normalizeStreamLoopMaxContinues(undefined)).toBe(DEFAULT_STREAM_LOOP_MAX_CONTINUES);
    expect(normalizeStreamLoopMaxContinues(Number.NaN)).toBe(DEFAULT_STREAM_LOOP_MAX_CONTINUES);
    expect(normalizeStreamLoopMaxContinues(-3)).toBe(DEFAULT_STREAM_LOOP_MAX_CONTINUES);
  });

  it('honors a configured budget and caps it', () => {
    expect(normalizeStreamLoopMaxContinues(0)).toBe(0);
    expect(normalizeStreamLoopMaxContinues(2)).toBe(2);
    expect(normalizeStreamLoopMaxContinues(99)).toBe(5);
  });
});
