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
 *
 * This file: legacy-measure reuse + immutability/observability.
 * PASS/COMPACT/REJECT semantics live in intra-turn-budget-gate-compaction.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Message } from '@earendil-works/pi-ai';
import { logger } from '../../logger.js';
import { PiContextBudgetExceededError } from '../../pi-agent/budget-gate.js';
import { resolveContextBudget } from '../../pi-agent/context-budget-resolver.js';
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
const asstToolCall = (id: string): Message =>
  ({ role: 'assistant', content: [{ type: 'toolCall', id, name: 'read', arguments: { path: 'a' } }], timestamp: 0 }) as Message;
const toolResult = (toolCallId: string, text: string): Message =>
  ({ role: 'toolResult', toolCallId, toolName: 'read', content: [{ type: 'text', text }], isError: false, timestamp: 0 }) as Message;

/** A text payload of exactly `tokens` tokens under the wire heuristic (chars/3). */
const textOfTokens = (tokens: number): string => 'x'.repeat(tokens * 3);

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
    // user 100 + toolResult 500 + toolCall declaration `read {"path":"a"}` = 6
    expect(m.historyTokens).toBe(606);
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
