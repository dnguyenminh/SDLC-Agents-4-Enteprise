/**
 * SA4E-355 — TA review condition #2 (commit 70a0a90): direct tests for the
 * transcript-compaction module. Previously this module (139 lines, public
 * exports `compactTranscriptToFit` / `flattenContent`) was only exercised
 * INDIRECTLY through the intra-turn-budget-gate tests.
 *
 * Pinned contracts (module doc):
 * - tool units (assistant toolCall + the toolResult messages that follow it)
 *   are ATOMIC trim boundaries — never split, or the provider 400s on the
 *   orphaned pairing;
 * - system messages are PINNED and do not consume `budgetTokens` (the budget
 *   applies to the non-system part only);
 * - trim is newest→oldest at unit granularity: once a unit does not fit, the
 *   trim point is set and ALL older non-pinned units are dropped (non-greedy);
 * - a unit that does not fit raw is kept with its text/thinking COMPRESSED
 *   (UC-03 `compressPrompt`); toolCall blocks stay intact for id pairing;
 * - the NEWEST USER message is PINNED (SA4E-355 bug 3): its budget is
 *   reserved before the tool-unit walk — it is kept raw when it fits,
 *   compressed when only that fits, and kept compressed even when over
 *   budget (the caller's BR-09 gate then REJECTS — never a userless
 *   transcript, which llama-server's qwen template 500s with
 *   "Jinja Exception: No user query found in messages.");
 * - never mutates the input; returns `{ messages, compacted }`.
 *
 * NOTE: `groupToolUnits` is private — its behavior (tool-unit atomicity,
 * multi-toolResult units, orphan toolResult units) is pinned through the
 * public `compactTranscriptToFit` API.
 *
 * Sibling suites: transcript-compaction-units.test.ts (tool-unit atomicity +
 * UC-03 compression), transcript-compaction-tombstone.test.ts (SA4E-368
 * tombstone), transcript-compaction-pinned-user.test.ts (bug 3 pin).
 */
import { describe, it, expect } from 'vitest';
import type { Message } from '@earendil-works/pi-ai';
import { compactTranscriptToFit, flattenContent } from '../transcript-compaction.js';
import {
  systemMsg,
  userMsg,
  asstText,
  asstToolCall,
  toolResult,
  textOfTokens,
  toolUnit,
  compressible,
  callIdsOf,
  resultIdsOf,
  rolesOf,
} from './transcript-compaction-helpers.js';

describe('flattenContent — wire-visible text of one message content', () => {
  it('returns string content as-is', () => {
    expect(flattenContent('plain text')).toBe('plain text');
  });

  it('returns an empty string for non-string non-array content (null/undefined/number)', () => {
    expect(flattenContent(null)).toBe('');
    expect(flattenContent(undefined)).toBe('');
    expect(flattenContent(42)).toBe('');
  });

  it('flattens a mixed block array — text/thinking/toolCall/unknown/bare-string — joined by newlines', () => {
    const content = [
      { type: 'text', text: 'answer' },
      { type: 'thinking', thinking: 'because' },
      { type: 'toolCall', id: 'tc-1', name: 'read', arguments: { path: 'a' } },
      { type: 'image' }, // unknown block type → JSON fallback
      'bare string block',
    ];
    expect(flattenContent(content)).toBe(
      ['answer', 'because', 'read {"path":"a"}', JSON.stringify({ type: 'image' }), 'bare string block'].join('\n')
    );
  });

  it('renders a text block without a text field as empty (?? fallback)', () => {
    expect(flattenContent([{ type: 'text' }])).toBe('');
  });
});

describe('compactTranscriptToFit — trim order and pinned system', () => {
  it('trims OLDEST-first: with room for one unit only, the NEWEST unit (tc-3) survives', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 200),
      ...toolUnit('tc-2', 200),
      ...toolUnit('tc-3', 200),
    ];
    const res = compactTranscriptToFit(messages, 220);
    expect(res.compacted).toBe(true);
    expect(callIdsOf(res.messages)).toEqual(['tc-3']); // newest call kept…
    expect(resultIdsOf(res.messages)).toEqual(['tc-3']); // …with its result, oldest two units gone
    // Bug 3: the pinned newest user message survives the trim point (previously dropped).
    expect(rolesOf(res.messages)).toEqual(['system', 'user', 'assistant', 'toolResult']);
    expect(res.messages.some((m) => (m as { role?: string }).role === 'user')).toBe(true);
  });

  it('the trim point is a hard boundary — older units are dropped EVEN WHEN they would fit', () => {
    // tc-1 (≈56) + kept tc-3 (≈56) = 112 ≤ 120, yet tc-1 must go: walking
    // newest→oldest, tc-2 not fitting sets the trim point for everything older.
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 50),
      ...toolUnit('tc-2', 400),
      ...toolUnit('tc-3', 50),
    ];
    const res = compactTranscriptToFit(messages, 120);
    expect(res.compacted).toBe(true);
    expect(resultIdsOf(res.messages)).toEqual(['tc-3']);
    expect(resultIdsOf(res.messages)).not.toContain('tc-1');
    // SA4E-368: the tombstone sits at the trim boundary (after the pinned
    // user, before the oldest kept unit) listing the dropped tc-1/tc-2 reads
    // (v1.53.8: USER role — never a trailing assistant note).
    expect(rolesOf(res.messages)).toEqual(['system', 'user', 'user', 'assistant', 'toolResult']); // pinned user survives
  });

  it('system messages are PINNED — a mid-transcript system survives past the trim point', () => {
    const messages: Message[] = [
      systemMsg('sys-start'),
      userMsg(textOfTokens(50)),
      systemMsg('sys-mid'),
      userMsg(textOfTokens(50)),
    ];
    const res = compactTranscriptToFit(messages, 20);
    expect(res.compacted).toBe(true);
    // The newest user message is pinned too (kept compressed over the 20-token
    // budget — the caller's BR-09 gate rejects such an overflow); both systems
    // still survive past the trim point.
    expect(rolesOf(res.messages)).toEqual(['system', 'system', 'user']);
    expect((res.messages[0] as { content?: string }).content).toBe('sys-start');
    expect((res.messages[1] as { content?: string }).content).toBe('sys-mid');
  });

  it('budgetTokens applies to the NON-SYSTEM part only — pinned system tokens do not consume budget', () => {
    const messages: Message[] = [systemMsg(textOfTokens(1000)), userMsg(textOfTokens(10))];
    const res = compactTranscriptToFit(messages, 20);
    expect(res.compacted).toBe(false); // user (10) fits the 20-token non-system budget
    expect(res.messages).toEqual(messages); // nothing trimmed despite the 1000-token system
  });
});

describe('compactTranscriptToFit — pass-through boundary and immutability', () => {
  it('a transcript that already fits returns an equal COPY (new array, compacted=false) — exact-fit boundary', () => {
    const messages: Message[] = [systemMsg('sys'), userMsg(textOfTokens(100)), asstText(textOfTokens(100))];
    const snapshot = JSON.stringify(messages);
    const res = compactTranscriptToFit(messages, 200); // exactly 200 = boundary-inclusive fit
    expect(res.compacted).toBe(false);
    expect(res.messages).not.toBe(messages); // new array — context immutability
    expect(res.messages).toEqual(messages); // same content, same order
    expect(JSON.stringify(messages)).toBe(snapshot);
  });

  it('an empty transcript passes through as an empty result', () => {
    expect(compactTranscriptToFit([], 100)).toEqual({ messages: [], compacted: false });
  });

  it('a system-only transcript survives even a zero budget (pinned ignores budget) with compacted=false', () => {
    const messages: Message[] = [systemMsg('a'), systemMsg('b')];
    const res = compactTranscriptToFit(messages, 0);
    expect(res.compacted).toBe(false);
    expect(res.messages).toEqual(messages);
  });

  it('never mutates the input on the compaction path — array AND message objects untouched', () => {
    const messages: Message[] = [systemMsg('sys'), userMsg('go'), asstToolCall('tc-1'), toolResult('tc-1', compressible(800))];
    const snapshot = JSON.stringify(messages);
    const res = compactTranscriptToFit(messages, 60);
    expect(res.compacted).toBe(true);
    expect(JSON.stringify(messages)).toBe(snapshot);
    // The original result message still carries the RAW text — compression
    // produced a NEW message object in the output, not an in-place rewrite.
    const inputResult = messages[3] as { content: Array<{ text?: string }> };
    expect(inputResult.content[0].text).toBe(compressible(800));
  });
});
