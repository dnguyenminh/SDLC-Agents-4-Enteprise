/**
 * SA4E-421 — scratchpad format tests: parse/render round-trip, enforcement
 * before tool calls, structural validation, evidence-exempt extraction.
 */

import { describe, it, expect } from 'vitest';
import {
  assertScratchpadBeforeToolCall,
  parseScratchpad,
  referencedEvidenceIds,
  renderScratchpad,
  validateScratchpad,
} from '../scratchpad.js';

const VALID = [
  'I will inspect the retry loop next.',
  '<scratchpad>',
  '* Goal: Fix the payment retry backoff bug',
  '* DeadEnds: src/util/money.ts:1-10 -> unrelated formatting helper',
  '* Facts: src/service/PaymentService.java:45-92 -> retry loop misses backoff [evidence:ch1]; src/config.yml:3 -> retry count set to 3 [chunk:ch9]',
  '* Plan: read_code_block(src/service/PaymentService.java, 45, 92) - inspect retry logic',
  '</scratchpad>',
].join('\n');

describe('SA4E-421 scratchpad format', () => {
  it('parses all 4 sections + structured DeadEnds/Facts items', () => {
    const sp = parseScratchpad(VALID);
    expect(sp.goal).toBe('Fix the payment retry backoff bug');
    expect(sp.deadEnds).toEqual([{ location: 'src/util/money.ts:1-10', note: 'unrelated formatting helper' }]);
    expect(sp.facts).toHaveLength(2);
    expect(sp.facts[0].location).toBe('src/service/PaymentService.java:45-92');
    expect(sp.plan).toContain('read_code_block');
  });

  it('round-trips through render (parse → render → parse)', () => {
    const sp = parseScratchpad(VALID);
    const again = parseScratchpad(`x\n${renderScratchpad(sp)}`);
    expect(again.goal).toBe(sp.goal);
    expect(again.deadEnds).toEqual(sp.deadEnds);
    expect(again.plan).toBe(sp.plan);
  });

  it('validation: missing sections / multi-sentence goal / no block → invalid', () => {
    expect(validateScratchpad(VALID).valid).toBe(true);
    const missing = VALID.replace('* Plan: read_code_block(src/service/PaymentService.java, 45, 92) - inspect retry logic\n', '');
    const r1 = validateScratchpad(missing);
    expect(r1.valid).toBe(false);
    expect(r1.errors[0]).toMatch(/missing sections: Plan/);
    const multiGoal = VALID.replace('* Goal: Fix the payment retry backoff bug', '* Goal: First do X. Then do Y.');
    const r2 = validateScratchpad(multiGoal);
    expect(r2.valid).toBe(false);
    expect(r2.errors[0]).toMatch(/single sentence/);
    const none = validateScratchpad('just a normal message');
    expect(none.valid).toBe(false);
    expect(none.errors[0]).toMatch(/not found/);
  });

  it('enforced before each tool call (AC): valid tail passes, missing block throws', () => {
    expect(() => assertScratchpadBeforeToolCall(VALID)).not.toThrow();
    expect(() => assertScratchpadBeforeToolCall('Let me call search_symbols.')).toThrow(/SCRATCHPAD_REQUIRED/);
    // block mid-message does NOT count — must be the tail
    expect(() => assertScratchpadBeforeToolCall(`${VALID}\nand then also do more stuff`)).toThrow(/SCRATCHPAD_REQUIRED/);
  });

  it('extracts scratchpad-referenced evidence IDs (eviction-exempt, AC)', () => {
    const ids = referencedEvidenceIds(VALID);
    expect(ids).toEqual(new Set(['ch1', 'ch9']));
    const fromModel = referencedEvidenceIds(parseScratchpad(VALID));
    expect(fromModel.has('ch1')).toBe(true);
    expect(referencedEvidenceIds('no refs here').size).toBe(0);
  });
});
