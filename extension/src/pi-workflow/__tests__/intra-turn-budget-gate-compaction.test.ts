/**
 * SA4E-355 — intra-turn gate PASS-THROUGH / COMPACT / REJECT semantics (BR-09).
 * Trim is newest→oldest at tool-unit granularity; pinned system + pinned user;
 * REJECT only when even the pinned user cannot fit.
 * Measure-reuse + observability suites live in intra-turn-budget-gate.test.ts.
 */
import { describe, it, expect } from 'vitest';
import type { Message } from '@earendil-works/pi-ai';
import { PiContextBudgetExceededError } from '../../pi-agent/budget-gate.js';
import { resolveContextBudget, DEFAULT_CONTEXT_WINDOW } from '../../pi-agent/context-budget-resolver.js';
import { usableTokensOf } from '../../pi-agent/models/ContextBudget.js';
import { governIntraTurnRequest } from '../intra-turn-budget-gate.js';

/** Qwen UAT budget: detected nCtx 65536 → usable 58293 (reserve 2000, margin 5243). */
const QWEN_INPUT = { modelId: 'qwen-text', nCtxDetected: 65536 as number | undefined };
const usableOf = (nCtxDetected?: number): number =>
  usableTokensOf(resolveContextBudget({ modelId: 'qwen-text', nCtxDetected }));

const systemMsg = (content: string, toolsAdded?: unknown[]): Message =>
  ({ role: 'system', content, ...(toolsAdded ? { toolsAdded } : {}), timestamp: 0 }) as Message;
const userMsg = (text: string): Message =>
  ({ role: 'user', content: text, timestamp: 0 }) as Message;
const asstText = (text: string): Message =>
  ({ role: 'assistant', content: [{ type: 'text', text }], timestamp: 0 }) as Message;
const asstToolCall = (id: string): Message =>
  ({ role: 'assistant', content: [{ type: 'toolCall', id, name: 'read', arguments: { path: 'a' } }], timestamp: 0 }) as Message;
const toolResult = (toolCallId: string, text: string): Message =>
  ({ role: 'toolResult', toolCallId, toolName: 'read', content: [{ type: 'text', text }], isError: false, timestamp: 0 }) as Message;

/** A text payload of exactly `tokens` tokens under the wire heuristic (chars/3). */
const textOfTokens = (tokens: number): string => 'x'.repeat(tokens * 3);

/** One tool unit (assistant toolCall + its result) of ~`tokens` tokens. */
const toolUnit = (id: string, tokens: number): Message[] =>
  [asstToolCall(id), toolResult(id, textOfTokens(tokens))];

describe('governIntraTurnRequest — PASS-THROUGH / COMPACT / REJECT (BR-09)', () => {
  it('PASS-THROUGH: under-budget transcript returns an equal COPY (never the same array)', () => {
    const messages = [systemMsg('sys'), userMsg(textOfTokens(100)), asstText(textOfTokens(100))];
    const res = governIntraTurnRequest({ messages, ...QWEN_INPUT });
    expect(res.compacted).toBe(false);
    expect(res.messages).not.toBe(messages); // new array — context immutability
    expect(res.messages).toEqual(messages);
  });

  it('COMPACT: over-budget tool units are trimmed OLDEST-FIRST, newest preserved byte-identical', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go read'),
      ...toolUnit('tc-1', 20000),
      ...toolUnit('tc-2', 20000),
      ...toolUnit('tc-3', 20000), // cumulative 60k+ > usable 58293
    ];
    const res = governIntraTurnRequest({ messages, ...QWEN_INPUT });
    expect(res.compacted).toBe(true);
    expect(res.totalTokens).toBeLessThanOrEqual(usableOf(65536));
    // The OLDEST unit (tc-1) was dropped; the NEWEST (tc-3) survives intact.
    const ids = res.messages
      .filter((m) => (m as { role?: string }).role === 'toolResult')
      .map((m) => (m as { toolCallId?: string }).toolCallId);
    expect(ids).not.toContain('tc-1');
    expect(ids).toContain('tc-3');
  });

  it('COMPACT: tool pairing is preserved — every kept toolResult keeps its assistant toolCall', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 20000),
      ...toolUnit('tc-2', 20000),
      ...toolUnit('tc-3', 20000),
    ];
    const res = governIntraTurnRequest({ messages, ...QWEN_INPUT });
    const callIds = new Set(
      res.messages
        .filter((m) => (m as { role?: string }).role === 'assistant')
        .flatMap((m) => ((m as { content?: Array<{ type?: string; id?: string }> }).content ?? []))
        .filter((b) => b.type === 'toolCall')
        .map((b) => b.id)
    );
    for (const m of res.messages) {
      if ((m as { role?: string }).role !== 'toolResult') continue;
      expect(callIds.has((m as { toolCallId?: string }).toolCallId)).toBe(true);
    }
  });

  it('COMPACT: system messages always survive (prompt + tool declarations are the fixed part)', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 20000),
      ...toolUnit('tc-2', 20000),
      ...toolUnit('tc-3', 20000),
    ];
    const res = governIntraTurnRequest({ messages, ...QWEN_INPUT });
    const systems = res.messages.filter((m) => (m as { role?: string }).role === 'system');
    expect(systems.length).toBe(1);
    expect((systems[0] as { content?: string }).content).toBe('sys');
  });

  it('COMPACT: a compressible NEWEST unit survives compressed when raw cannot fit (UC-03)', () => {
    // Raw ≈ 76.7k tokens > history budget 56417; compression strips the example
    // wall so the unit fits — the newest message must never be dropped.
    const compressible = `Example:\n${'e'.repeat(230000)}\n\n# Restored\n\nkeep me`;
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      asstToolCall('tc-1'),
      toolResult('tc-1', compressible),
    ];
    const res = governIntraTurnRequest({ messages, ...QWEN_INPUT });
    expect(res.compacted).toBe(true);
    const kept = res.messages.find(
      (m) => (m as { role?: string }).role === 'toolResult' && (m as { toolCallId?: string }).toolCallId === 'tc-1'
    ) as { content: Array<{ type: string; text?: string }> } | undefined;
    expect(kept).toBeDefined();
    const text = kept!.content.map((b) => b.text ?? '').join('');
    expect(text).toContain('keep me');
    expect(text.length).toBeLessThan(compressible.length);
    expect(res.totalTokens).toBeLessThanOrEqual(usableOf(65536));
  });

  it('COMPACT (bug 3): an incompressible 70k tool unit alone over the budget is dropped ATOMICALLY — the pinned user query keeps the request respondable', () => {
    // UAT shape: one 70k-token tool result cannot fit 58293 even compressed.
    // Bug 3 semantics: the oversized unit is dropped whole (never orphaned)
    // while the PINNED user message survives — the compacted request stays
    // respondable instead of 500ing on a userless transcript. REJECT (BR-09)
    // now only fires when even the pinned user cannot fit (see the 70k-user
    // REJECT cases below).
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      asstToolCall('tc-1'),
      toolResult('tc-1', textOfTokens(70000)),
    ];
    const res = governIntraTurnRequest({ messages, ...QWEN_INPUT });
    expect(res.compacted).toBe(true);
    const ids = res.messages
      .filter((m) => (m as { role?: string }).role === 'toolResult')
      .map((m) => (m as { toolCallId?: string }).toolCallId);
    expect(ids).toEqual([]); // the oversized unit never reaches the wire
    expect(res.messages.some((m) => (m as { role?: string }).role === 'user')).toBe(true); // pinned user query
    expect(res.totalTokens).toBeLessThanOrEqual(usableOf(65536));
  });

  it('REJECT: error carries the nCtx of the resolved budget (BR-01 chain)', () => {
    const messages: Message[] = [systemMsg('sys'), userMsg(textOfTokens(70000))];
    try {
      governIntraTurnRequest({ messages, ...QWEN_INPUT });
      expect.fail('expected PiContextBudgetExceededError');
    } catch (err) {
      expect((err as PiContextBudgetExceededError).nCtx).toBe(65536);
    }
  });

  it('BR-01 chain: a SMALLER detected window compacts harder than the registry/default', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 2000),
      ...toolUnit('tc-2', 2000),
    ]; // ~4k tokens of history + fixed ≈ 5.9k tokens
    const big = governIntraTurnRequest({ messages, nCtxDetected: 65536, modelId: 'qwen-text' });
    const tiny = governIntraTurnRequest({
      messages,
      modelId: 'unknown-model', // registry miss → DEFAULT_CONTEXT_WINDOW 8192
    });
    expect(big.compacted).toBe(false); // ≈5.9k ≪ usable 58293
    expect(tiny.compacted).toBe(true); // history budget 3661 < ~4k → oldest unit dropped
    expect(tiny.messages.length).toBeLessThan(big.messages.length);
  });

  it('BR-01 chain: no detection and unknown model fall back to the terminal default (8192)', () => {
    // 70k tokens over an 8192 window → usable floor → REJECT, error names the default nCtx.
    const messages: Message[] = [systemMsg('sys'), userMsg(textOfTokens(70000))];
    expect(() => governIntraTurnRequest({ messages, modelId: 'unknown-model' })).toThrow(
      PiContextBudgetExceededError
    );
    try {
      governIntraTurnRequest({ messages, modelId: 'unknown-model' });
    } catch (err) {
      expect((err as PiContextBudgetExceededError).nCtx).toBe(DEFAULT_CONTEXT_WINDOW);
    }
  });
});
