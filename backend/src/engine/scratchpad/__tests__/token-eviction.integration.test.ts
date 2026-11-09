/**
 * SA4E-428 — Token/eviction integration harness (16K Doc §8, SA4E-421 engine).
 *
 * End-to-end across modules: a REAL scratchpad block is parsed, its evidence
 * references become eviction exemptions, and batch eviction under budget
 * pressure keeps exactly those referenced tool calls while tombstoning the
 * rest — ids preserved, target reached, no overflow.
 */

import { describe, it, expect } from 'vitest';
import { batchEvict, EVICTION_AGE_WEIGHT, EVICTION_REFERENCE_CREDIT, evictionScore, tombstoneTokens, type HistoryMessage } from '../eviction.js';
import { parseScratchpad, referencedEvidenceIds, renderScratchpad } from '../scratchpad.js';
import { estimateTokens } from '../../agent-tools/tool-context.js';

/** Scratchpad in the canonical format; one evidence ref + one dead end. */
const SCRATCHPAD = [
  '<scratchpad>',
  '* Goal: fix the payment retry loop',
  '* DeadEnds: src/util.ts:1 -> unrelated helper',
  '* Facts: src/auth.ts:10 -> evidence:abc handles retries; chunk:xyz is stale',
  '* Plan: call read_code_block on src/auth.ts lines 10-40',
  '</scratchpad>',
].join('\n');

function toolMessage(
  toolCallId: string,
  chars: number,
  ageTurns: number,
  extra: Partial<HistoryMessage> = {},
): HistoryMessage {
  return { toolCallId, role: 'tool', content: 'x'.repeat(chars), ageTurns, ...extra };
}

describe('SA4E-428 scratchpad + eviction under budget pressure', () => {
  it('parses the scratchpad and derives the exemption set from evidence refs', () => {
    const sp = parseScratchpad(SCRATCHPAD);
    expect(sp.goal).toBe('fix the payment retry loop');
    expect(sp.facts[0].location).toBe('src/auth.ts:10');
    const ids = referencedEvidenceIds(sp);
    expect([...ids]).toEqual(['abc', 'xyz']); // evidence:abc + chunk:xyz
    expect(referencedEvidenceIds(renderScratchpad(sp))).toEqual(ids); // render round-trip
  });

  it('score formula is exact and protects referenced/in-use entries', () => {
    const old = toolMessage('tc-old', 400, 3); // 100 tokens, 3 turns
    expect(evictionScore(old, false)).toBe(3 * EVICTION_AGE_WEIGHT + 100);
    expect(evictionScore(old, false)).toBe(700);
    const referenced = { ...old, referencedInLastThought: true };
    expect(evictionScore(referenced, false)).toBe(700 - EVICTION_REFERENCE_CREDIT);
    expect(evictionScore({ ...old, inUse: true }, false)).toBe(Number.NEGATIVE_INFINITY);
    expect(evictionScore(old, true)).toBe(Number.NEGATIVE_INFINITY);
  });

  it('evicts the un-referenced oldest prefix, keeps scratchpad evidence, no overflow', () => {
    // budget 1000 → trigger > 750, drain to ≤ 700
    const messages = [
      toolMessage('tc-old-big', 4000, 5), // 1000 tok, score 2000 → evicted first
      toolMessage('ch-keep', 2400, 4), // 600 tok but referenced by scratchpad
      toolMessage('tc-mid', 1200, 2), // 300 tok, score 700
      toolMessage('tc-fresh', 320, 0), // 80 tok, score 80
    ];
    messages[1].toolCallId = 'abc'; // matches evidence:abc exemption
    const exempt = referencedEvidenceIds(SCRATCHPAD);
    const result = batchEvict(messages, { tokenBudget: 1000, exemptEvidenceIds: exempt });

    expect(result.batchTriggered).toBe(true);
    expect(result.evictedToolCallIds[0]).toBe('tc-old-big'); // highest score first
    expect(result.exemptedToolCallIds).toContain('abc');
    expect(result.evictedToolCallIds).not.toContain('abc'); // referenced → never evicted
    expect(result.tokensAfter).toBeLessThanOrEqual(700); // target reached
    expect(result.tokensAfter).toBeLessThan(result.tokensBefore);
    // tombstone preserves every evicted tool_call_id in place
    for (const id of result.evictedToolCallIds) {
      const row = result.messages.find((m) => m.toolCallId === id)!;
      expect(row.evicted).toBe(true);
      expect(row.content).toBe(`[evicted tool_call_id=${id}]`);
      expect(estimateTokens(row.content)).toBe(tombstoneTokens(id));
    }
    // the exempt row is byte-identical to the input
    expect(result.messages.find((m) => m.toolCallId === 'abc')).toMatchObject({ content: messages[1].content });
  });

  it('no pressure → no eviction even with a scratchpad exemption set', () => {
    const messages = [toolMessage('abc', 40, 1), toolMessage('t2', 40, 0)];
    const result = batchEvict(messages, { tokenBudget: 1000, exemptEvidenceIds: referencedEvidenceIds(SCRATCHPAD) });
    expect(result.batchTriggered).toBe(false);
    expect(result.evictedToolCallIds).toEqual([]);
    expect(result.tokensAfter).toBe(result.tokensBefore);
    expect(result.tokensBefore).toBeLessThanOrEqual(1000 * 0.75); // stayed below threshold
  });
});
