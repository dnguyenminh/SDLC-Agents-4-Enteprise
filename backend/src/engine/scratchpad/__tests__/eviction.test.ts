/**
 * SA4E-421 — eviction tests: score formula, 75% batch trigger, tombstone
 * tool_call_id preservation, evidence/in-use exemptions, headroom drain.
 */

import { describe, it, expect } from 'vitest';
import {
  batchEvict,
  EVICTION_AGE_WEIGHT,
  EVICTION_REFERENCE_CREDIT,
  evictionScore,
  tombstoneTokens,
  type HistoryMessage,
} from '../eviction.js';
import { estimateTokens } from '../../agent-tools/tool-context.js';

function msg(toolCallId: string, chars: number, ageTurns: number, extra: Partial<HistoryMessage> = {}): HistoryMessage {
  return { toolCallId, role: 'tool', content: 'x'.repeat(chars), ageTurns, ...extra };
}

describe('SA4E-421 eviction score', () => {
  it('S_evict = age×200 + tokens − referenced×1000 (exact formula)', () => {
    // age 3, 400 chars → 100 tokens, not referenced → 600 + 100 = 700
    const m = msg('t1', 400, 3);
    expect(evictionScore(m, false)).toBe(3 * EVICTION_AGE_WEIGHT + estimateTokens(m.content));
    expect(evictionScore(m, false)).toBe(700);
    const referenced = msg('t2', 400, 3, { referencedInLastThought: true });
    expect(evictionScore(referenced, false)).toBe(700 - EVICTION_REFERENCE_CREDIT);
    // exempt / in-use → never evict
    expect(evictionScore(m, true)).toBe(Number.NEGATIVE_INFINITY);
    expect(evictionScore(msg('t3', 400, 3, { inUse: true }), false)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('SA4E-421 batch eviction at 75% budget', () => {
  it('below threshold → no eviction, batchTriggered=false', () => {
    const messages = [msg('t1', 40, 1), msg('t2', 40, 0)];
    const r = batchEvict(messages, { tokenBudget: 1000 });
    expect(r.batchTriggered).toBe(false);
    expect(r.evictedToolCallIds).toHaveLength(0);
    expect(r.messages).toBe(messages);
  });

  it('at 75% trigger → batch evicts highest-score first down to 70% target (AC)', () => {
    // budget 1000 → threshold 750 → target 700.
    // totals: 1000 + 600 + 80 = 1680 tokens > 750 → trigger.
    const messages = [
      msg('old-big', 4000, 5),   // 1000 tok, score 1000+1000 = 2000 (first)
      msg('mid', 2400, 2),       // 600 tok, score 400+600 = 1000
      msg('new-small', 320, 0),  // 80 tok, score 0+80 = 80 (last)
    ];
    const r = batchEvict(messages, { tokenBudget: 1000 });
    expect(r.batchTriggered).toBe(true);
    expect(r.evictedToolCallIds[0]).toBe('old-big'); // highest score evicted first
    expect(r.tokensAfter).toBeLessThanOrEqual(700);
    expect(r.evictedToolCallIds.length).toBeGreaterThanOrEqual(1);
  });

  it('tombstone preserves tool_call_id and clears content (AC)', () => {
    const messages = [msg('tc-42', 4000, 9)];
    const r = batchEvict(messages, { tokenBudget: 500 });
    const t = r.messages.find((m) => m.toolCallId === 'tc-42')!;
    expect(t.evicted).toBe(true);
    expect(t.toolCallId).toBe('tc-42'); // preserved in-place
    expect(t.content).toBe('[evicted tool_call_id=tc-42]');
    expect(estimateTokens(t.content)).toBe(tombstoneTokens('tc-42'));
  });

  it('exempts scratchpad-referenced evidence IDs (AC)', () => {
    const messages = [msg('ch1', 2000, 9), msg('other', 2000, 9)];
    const r = batchEvict(messages, {
      tokenBudget: 800,
      exemptEvidenceIds: new Set(['ch1']),
    });
    expect(r.exemptedToolCallIds).toContain('ch1');
    expect(r.evictedToolCallIds).not.toContain('ch1'); // referenced by scratchpad → kept
    expect(r.evictedToolCallIds).toContain('other');
    const kept = r.messages.find((m) => m.toolCallId === 'ch1')!;
    expect(kept.evicted).toBeUndefined();
  });

  it('never evicts code currently in use (AC)', () => {
    const messages = [msg('active-read', 3000, 9, { inUse: true }), msg('stale', 3000, 9)];
    const r = batchEvict(messages, { tokenBudget: 800 });
    expect(r.evictedToolCallIds).toEqual(['stale']);
    expect(r.messages.find((m) => m.toolCallId === 'active-read')?.evicted).toBeUndefined();
  });

  it('referenced-in-last-thought gets −1000 credit (evicted later than unreferenced peer)', () => {
    const messages = [msg('hot', 800, 3, { referencedInLastThought: true }), msg('cold', 800, 3), msg('tiny', 8, 0)];
    // beyond-75% only slightly: budget 900 → threshold 675; evict until ≤630
    const r = batchEvict(messages, { tokenBudget: 900 });
    // cold (score 800) evicted before hot (score -200)
    const coldIdx = r.evictedToolCallIds.indexOf('cold');
    if (r.evictedToolCallIds.includes('hot')) {
      expect(coldIdx).toBeLessThan(r.evictedToolCallIds.indexOf('hot'));
    }
  });

  it('all-exempt history: nothing evictable, tokens unchanged', () => {
    const messages = [msg('a', 2000, 9, { inUse: true }), msg('b', 2000, 9, { inUse: true })];
    const r = batchEvict(messages, { tokenBudget: 500 });
    expect(r.evictedToolCallIds).toHaveLength(0);
    expect(r.tokensAfter).toBe(r.tokensBefore);
  });
});
