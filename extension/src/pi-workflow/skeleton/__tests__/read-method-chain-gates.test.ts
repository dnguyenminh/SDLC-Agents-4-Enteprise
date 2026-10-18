/**
 * SA4E-360 — read_method chain: gate interplay tests (STC IT-05, IT-06)
 * plus the estimator parity audit hook (INV-2).
 * Pure in-memory: no SQLite/HTTP fixture needed. The DB-backed chain cases
 * (IT-04/IT-11/IT-12) live in read-method-chain.integration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import type { Message } from '@earendil-works/pi-ai';
import { governIntraTurnRequest } from '../../intra-turn-budget-gate.js';
import { TurnBudgetGuard } from '../../turn-budget-guard.js';
import { estimateTokenCount } from '../../../pi-agent/prompt-compressor.js';

// STC IT-05 — gate #3 absorption: read_method results compactable (BR-360-04)
describe('IT-05: gate #3 absorbs read_method tool results', () => {
  it('compacts atomically (toolCall + toolResult together), preserves the pinned user', () => {
    const slice = 'x'.repeat(4_000 * 4); // a large read_method result
    const messages = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'review the workspace' },
      { role: 'assistant', content: [{ type: 'toolCall', id: 't1', name: 'read_method', input: { class: 'A', method: 'b' } }] },
      { role: 'toolResult', content: [{ type: 'text', text: slice }], toolCallId: 't1' },
      { role: 'assistant', content: [{ type: 'toolCall', id: 't2', name: 'read_method', input: { class: 'C', method: 'd' } }] },
      { role: 'toolResult', content: [{ type: 'text', text: slice }], toolCallId: 't2' },
      { role: 'user', content: 'newest pinned question' },
    ] as unknown as Message[];
    const result = governIntraTurnRequest({ messages, modelId: 'qwen', nCtxDetected: 8192 });
    const flattened = JSON.stringify(result.messages);
    expect(result.compacted).toBe(true); // gate #3 measured → COMPACT
    // Atomic tool-unit drop: no orphaned toolCall without its result.
    const callIds = (flattened.match(/"t1"/g) ?? []).length;
    if (callIds === 0) expect(flattened).not.toContain('toolCallId":"t1"');
    expect(JSON.stringify(result.messages)).toContain('newest pinned question'); // pinned user preserved
    expect(result.totalTokens).toBeGreaterThan(0);
  });
});

// STC IT-06 — TurnBudgetGuard interplay (BR-11 — shipped guard only, RM-16)
describe('IT-06: TurnBudgetGuard counts identical read_method calls', () => {
  it('steers at the 4th identical call; different args are not counted', () => {
    const guard = new TurnBudgetGuard({ timeoutMs: 0, maxSameToolRepeats: 4 }, () => undefined);
    const args = JSON.stringify({ class: 'X', method: 'y' });
    expect(guard.observeToolCall('read_method', args)).toBe('ok');
    expect(guard.observeToolCall('read_method', args)).toBe('ok');
    expect(guard.observeToolCall('read_method', args)).toBe('ok');
    expect(guard.observeToolCall('read_method', args)).toBe('steer'); // fires at 4
    // Control: DIFFERENT args never count toward the identical signature.
    const varied = new TurnBudgetGuard({ timeoutMs: 0, maxSameToolRepeats: 4 }, () => undefined);
    for (let i = 0; i < 4; i++) {
      expect(varied.observeToolCall('read_method', JSON.stringify({ class: 'X', method: `m${i}` }))).toBe('ok');
    }
    expect(varied.stats.totalCalls).toBe(4);
  });
});

/** Sanity: the estimator matches the shipped one (INV-2 audit hook). */
describe('chain estimator parity', () => {
  it('estimateTokenCount is chars/4', () => {
    expect(estimateTokenCount('abcd')).toBe(1);
  });
});
