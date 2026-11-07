/**
 * CHAT-LOOP-CONT — legacy path (promptOnCurrentModel) thinking-loop
 * auto-continuation. Uses a duck-typed Agent (the subset prompt-attempt.ts
 * touches: subscribe/prompt/abort/steer/waitForIdle/state) so the degenerate
 * stream is simulated deterministically. Contract: a degenerating THINKING
 * stream is aborted and the SAME agent is re-prompted with an anchored
 * continuation message — the turn continues, never a silent stop.
 */
import { describe, it, expect, vi } from 'vitest';
import { promptOnCurrentModel } from '../turn-runner.js';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

const FRAG64 = 'legacy-thinking-fragment-exactly-64-chars-long-aaaaaaaa'.slice(0, 64).padEnd(64, 'x');

type Listener = (event: AgentEvent) => void;

/** Minimal duck-typed Agent: a scripted emitter with abort/steer counters. */
function fakeAgent(script: Array<(emit: (e: Partial<AgentEvent>) => void, call: number) => void>) {
  const listeners: Listener[] = [];
  const agent = {
    abortCalls: 0,
    steerCalls: [] as string[],
    prompts: [] as string[],
    state: { isStreaming: false, messages: [] as unknown[], errorMessage: undefined as string | undefined, tools: [] },
    subscribe(listener: Listener) {
      listeners.push(listener);
      return () => undefined;
    },
    abort() { agent.abortCalls++; },
    steer(msg: { content: Array<{ text: string }> }) { agent.steerCalls.push(msg.content[0]?.text ?? ''); },
    waitForIdle: async () => undefined,
    async prompt(text: string) {
      agent.prompts.push(text);
      const step = script[agent.prompts.length - 1];
      if (!step) throw new Error('unexpected extra prompt call');
      step((e) => { for (const l of listeners) l(e as AgentEvent); });
    },
  };
  return agent;
}

const thinkingDelta = (delta: string) =>
  ({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta } }) as Partial<AgentEvent>;
const textDelta = (delta: string) =>
  ({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta } }) as Partial<AgentEvent>;

describe('promptOnCurrentModel — thinking-loop auto-continuation (legacy path)', () => {
  it('aborts the degenerate attempt and re-prompts the SAME agent with the anchor', async () => {
    const agent = fakeAgent([
      (emit) => {
        emit(thinkingDelta('analyzing the session turns '));
        for (let i = 0; i < 20; i++) emit(thinkingDelta(FRAG64));
        // abort() settles the run with no answer text.
      },
      (emit) => {
        emit(textDelta('final answer'));
      },
    ]);

    const result = await promptOnCurrentModel(agent, 'user question', { timeoutMs: 0 }, undefined, {
      maxStreamLoopContinues: 1,
    });

    expect(agent.prompts).toHaveLength(2);
    expect(agent.prompts[1]).toContain('[SYSTEM NOTE]');
    expect(agent.prompts[1]).toContain('analyzing the session turns');
    expect(agent.prompts[1]).toContain('Do NOT repeat');
    expect(agent.abortCalls).toBe(1); // silent abort of the degenerate attempt
    // The turn CONTINUED: notice + final answer in the merged replay chunks.
    const texts = result.chunks.filter((c) => c.type === 'text').map((c) => c.content ?? '');
    expect(texts.join('')).toContain('auto-continuing');
    expect(result.text).toContain('final answer');
    expect(result.text).toContain('auto-continuing');
    // An intentional stop is NEVER a turn error (no red bubble, no fallback).
    expect(result.errorMessage).toBeUndefined();
    // Exactly one terminal 'done' chunk for the adapter's replay.
    expect(result.chunks.filter((c) => c.type === 'done')).toHaveLength(1);
  });

  it('ends with the friendly stop note when the continuation budget is exhausted', async () => {
    const agent = fakeAgent([
      (emit) => {
        emit(thinkingDelta('start '));
        for (let i = 0; i < 20; i++) emit(thinkingDelta(FRAG64));
      },
    ]);

    const result = await promptOnCurrentModel(agent, 'q', { timeoutMs: 0 }, undefined, {
      maxStreamLoopContinues: 0, // budget disabled → visible stop, no continuation
    });

    expect(agent.prompts).toHaveLength(1);
    expect(agent.abortCalls).toBe(1);
    expect(result.text).toContain('Stopped early'); // buildStopNote('repeat', …)
    expect(result.errorMessage).toBeUndefined(); // intentional stop, not an error
    expect(result.chunks.filter((c) => c.type === 'done')).toHaveLength(1);
  });

  it('clean turns are byte-identical in behavior: one attempt, no notice, error passthrough', async () => {
    const agent = fakeAgent([
      (emit) => {
        emit(textDelta('plain answer'));
      },
    ]);

    const result = await promptOnCurrentModel(agent, 'q', { timeoutMs: 0 }, undefined, {
      maxStreamLoopContinues: 1,
    });

    expect(agent.prompts).toHaveLength(1);
    expect(agent.abortCalls).toBe(0);
    expect(result.text).toBe('plain answer');
    expect(result.text).not.toContain('loop');
    expect(result.chunks.filter((c) => c.type === 'done')).toHaveLength(1);
  });
});
