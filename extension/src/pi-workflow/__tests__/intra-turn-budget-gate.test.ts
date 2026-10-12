/**
 * SA4E-355 UAT bug 2 — per-request intra-turn budget gate unit tests.
 *
 * Root cause: `governLegacyTurnOrReject` gates the turn ONCE at turn start,
 * but the pi-ai Agent loop makes MANY intra-turn LLM requests (each tool
 * result appends to the transcript) — iteration ~5 hit 76,349 tokens against
 * a 65,536 n_ctx as a raw 400. These tests pin the streamFn-gate contract:
 * EVERY request is measured (reusing the legacy measure), compacted
 * (trim-oldest-first at tool-unit granularity) or REJECTED with
 * PI_CONTEXT_BUDGET_EXCEEDED — the provider never sees an oversized request.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Message } from '@earendil-works/pi-ai';
import { logger } from '../../logger.js';
import { PiContextBudgetExceededError, isBudgetExceededError } from '../../pi-agent/budget-gate.js';
import { resolveContextBudget, DEFAULT_CONTEXT_WINDOW } from '../../pi-agent/context-budget-resolver.js';
import { usableTokensOf } from '../../pi-agent/models/ContextBudget.js';
import {
  measureIntraTurnRequest,
  governIntraTurnRequest,
} from '../intra-turn-budget-gate.js';

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

/** A text payload of exactly `tokens` tokens under the chars/4 heuristic. */
const textOfTokens = (tokens: number): string => 'x'.repeat(tokens * 4);

/** One tool unit (assistant toolCall + its result) of ~`tokens` tokens. */
const toolUnit = (id: string, tokens: number): Message[] =>
  [asstToolCall(id), toolResult(id, textOfTokens(tokens))];

describe('measureIntraTurnRequest — reuse of the legacy measure (system+tools+messages)', () => {
  it('accounts for the replayed system prompt, tool declarations and every non-system message', () => {
    const tools = [{ name: 'read', description: 'd', parameters: { a: 'y'.repeat(400) } }];
    const messages = [
      systemMsg('sys prompt '.repeat(20), tools), // prompt + toolsAdded declarations
      userMsg(textOfTokens(100)),
      ...toolUnit('tc-1', 500),
    ];
    const m = measureIntraTurnRequest({ messages, ...QWEN_INPUT });
    expect(m.systemTokens).toBeGreaterThan(0);
    expect(m.toolSchemaTokens).toBeGreaterThan(0); // toolsAdded replayed → OI-4 estimator
    // user 100 + toolResult 500 + toolCall declaration `read {"path":"a"}` = 5
    expect(m.historyTokens).toBe(605);
    expect(m.totalTokens).toBe(m.systemTokens + m.historyTokens + m.promptTokens + m.toolSchemaTokens);
  });

  it('never double-counts system messages — replay collapses them into one prompt', () => {
    const withTools = measureIntraTurnRequest({
      messages: [systemMsg('p1'), systemMsg('p2', [{ name: 't', parameters: {} }]), userMsg('u')],
      ...QWEN_INPUT,
    });
    const withoutTools = measureIntraTurnRequest({
      messages: [systemMsg('p1'), systemMsg('p2'), userMsg('u')],
      ...QWEN_INPUT,
    });
    // Only the tool schema differs — system text is the replayed prompt either way.
    expect(withoutTools.toolSchemaTokens).toBe(0);
    expect(withTools.historyTokens).toBe(withoutTools.historyTokens);
  });
});

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
    // Raw ≈ 57.5k tokens > history budget 56417; compression strips the example
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

  it('REJECT: single newest unit alone over the usable budget → PI_CONTEXT_BUDGET_EXCEEDED', () => {
    // UAT shape: one 70k-token tool result cannot fit 58293 even compressed.
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      asstToolCall('tc-1'),
      toolResult('tc-1', textOfTokens(70000)),
    ];
    const attempt = () => governIntraTurnRequest({ messages, ...QWEN_INPUT });
    expect(attempt).toThrow(PiContextBudgetExceededError);
    try {
      attempt();
    } catch (err) {
      expect(isBudgetExceededError(err)).toBe(true);
      expect((err as PiContextBudgetExceededError).label).toBe('request');
      expect((err as PiContextBudgetExceededError).staticTokens).toBeGreaterThan(
        (err as PiContextBudgetExceededError).staticBudget
      );
    }
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

describe('governIntraTurnRequest — immutability + observability', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('never mutates the input transcript (messages array AND message objects untouched)', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 20000),
      ...toolUnit('tc-2', 20000),
      ...toolUnit('tc-3', 20000),
    ];
    const snapshot = JSON.stringify(messages);
    governIntraTurnRequest({ messages, ...QWEN_INPUT });
    expect(JSON.stringify(messages)).toBe(snapshot);
  });

  it('logs PI_LEGACY_HISTORY_COMPACTED with the governance shape when compaction runs', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 20000),
      ...toolUnit('tc-2', 20000),
      ...toolUnit('tc-3', 20000),
    ];
    const res = governIntraTurnRequest({ messages, ...QWEN_INPUT });
    expect(res.compacted).toBe(true);
    const event = infoSpy.mock.calls.find((c) => c[0] === 'PI_LEGACY_HISTORY_COMPACTED');
    expect(event).toBeDefined();
    const data = event![1] as Record<string, unknown>;
    expect(data.modelId).toBe('qwen-text');
    expect(data.nCtx).toBe(65536);
    expect(data.usable).toBe(usableOf(65536));
    expect(data.totalTokens).toBe(res.totalTokens);
    expect(data.historyMessages).toBeGreaterThan(0);
  });

  it('does NOT log compaction events on pass-through requests', () => {
    governIntraTurnRequest({ messages: [systemMsg('sys'), userMsg('hi')], ...QWEN_INPUT });
    expect(infoSpy.mock.calls.some((c) => c[0] === 'PI_LEGACY_HISTORY_COMPACTED')).toBe(false);
  });

  it('logs PI_CONTEXT_BUDGET_EXCEEDED before throwing (BR-09 observability)', () => {
    const messages: Message[] = [systemMsg('sys'), userMsg(textOfTokens(70000))];
    expect(() => governIntraTurnRequest({ messages, ...QWEN_INPUT })).toThrow(PiContextBudgetExceededError);
    expect(errorSpy.mock.calls.some((c) => c[0] === 'PI_CONTEXT_BUDGET_EXCEEDED')).toBe(true);
  });
});
