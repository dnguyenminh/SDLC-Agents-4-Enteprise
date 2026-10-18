/**
 * transcript-compaction — tool-unit atomicity (groupToolUnits via the public
 * compactTranscriptToFit API) + text compression fallback (UC-03).
 * flattenContent / trim-order / pass-through suites live in
 * transcript-compaction.test.ts; the SA4E-368 tombstone and the bug-3 pin in
 * transcript-compaction-tombstone.test.ts / -pinned-user.test.ts.
 */
import { describe, it, expect } from 'vitest';
import type { Message } from '@earendil-works/pi-ai';
import { compactTranscriptToFit } from '../transcript-compaction.js';
import {
  systemMsg,
  userMsg,
  asstToolCall,
  toolResult,
  textOfTokens,
  toolUnit,
  compressible,
  callIdsOf,
  resultIdsOf,
  rolesOf,
} from './transcript-compaction-helpers.js';

describe('tool-unit atomicity (groupToolUnits via compactTranscriptToFit)', () => {
  it('drops a tool unit ATOMICALLY — a result that alone would fit is never orphaned from its call', () => {
    // unit tc-2 ≈ 206 tokens (call 6 + result 200): the RESULT alone fits
    // budget 200 exactly, but call+result do not → the WHOLE unit must go.
    const messages = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 200),
      ...toolUnit('tc-2', 200),
    ];
    const res = compactTranscriptToFit(messages, 200);
    expect(res.compacted).toBe(true);
    expect(callIdsOf(res.messages)).toEqual([]); // no orphaned assistant call
    expect(resultIdsOf(res.messages)).toEqual([]); // no orphaned toolResult
    // Bug 3: the newest user message is PINNED — it survives the trim point.
    // SA4E-368: a tombstone note precedes the pinned user, listing the dropped
    // read activity so the model never re-reads those files (v1.53.8: USER
    // role — assistant notes get echoed verbatim by local models).
    expect(rolesOf(res.messages)).toEqual(['system', 'user', 'user']);
    expect((res.messages[2] as { content?: string }).content).toBe('go'); // the real query stays LAST
  });

  it('keeps a MULTI-toolResult unit whole — one call + its two results survive together', () => {
    const messages = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 200),
      asstToolCall('tc-a'),
      toolResult('tc-a', textOfTokens(100)),
      toolResult('tc-b', textOfTokens(100)), // second result of the same unit
    ];
    const res = compactTranscriptToFit(messages, 220); // multi-unit ≈ 206 fits; tc-1 + user do not
    expect(res.compacted).toBe(true);
    expect(callIdsOf(res.messages)).toEqual(['tc-a']);
    expect(resultIdsOf(res.messages)).toEqual(['tc-a', 'tc-b']); // both results kept with their call
    expect(rolesOf(res.messages)).toEqual(['system', 'user', 'assistant', 'toolResult', 'toolResult']); // pinned user survives
  });

  it('drops a MULTI-toolResult unit whole — both results vanish together with their call', () => {
    const messages = [
      systemMsg('sys'),
      userMsg('go'),
      asstToolCall('tc-a'),
      toolResult('tc-a', textOfTokens(100)),
      toolResult('tc-b', textOfTokens(100)),
    ];
    const res = compactTranscriptToFit(messages, 100); // neither the unit (206) nor any piece fits safely
    expect(res.compacted).toBe(true);
    expect(callIdsOf(res.messages)).toEqual([]);
    expect(resultIdsOf(res.messages)).toEqual([]); // never just one of the two results
    // SA4E-368: the tombstone precedes the pinned user (v1.53.8: USER role);
    // the multi-result call is listed once (its toolCall block), so the model
    // knows it already ran.
    expect(rolesOf(res.messages)).toEqual(['system', 'user', 'user']);
  });

  it('treats an ORPHAN toolResult (no preceding assistant toolCall) as its own unit', () => {
    // The orphan follows a user message (no pairing anchor) → standalone unit:
    // it is dropped on its own while the NEWER user message survives.
    const messages = [
      systemMsg('sys'),
      toolResult('tc-x', textOfTokens(100)),
      userMsg('go'),
    ];
    const res = compactTranscriptToFit(messages, 95);
    expect(res.compacted).toBe(true);
    expect(resultIdsOf(res.messages)).toEqual([]);
    const user = res.messages.find((m) => (m as { role?: string }).role === 'user') as { content?: string };
    expect(user?.content).toBe('go'); // newest non-system unit survives; only the orphan is trimmed
    expect(rolesOf(res.messages)).toEqual(['system', 'user']);
  });
});

describe('compactTranscriptToFit — text compression fallback (UC-03)', () => {
  it('keeps the newest unit COMPRESSED when raw does not fit — toolCall blocks stay intact', () => {
    const raw = compressible(800);
    const messages = [systemMsg('sys'), userMsg('go'), asstToolCall('tc-1'), toolResult('tc-1', raw)];
    const res = compactTranscriptToFit(messages, 60); // raw unit ≈ 300 > 60; compressed ≈ 12 ≤ 60
    expect(res.compacted).toBe(true);
    // After compression frees budget (12 of 60), the 1-token user message fits too.
    expect(rolesOf(res.messages)).toEqual(['system', 'user', 'assistant', 'toolResult']); // unit kept whole
    const result = res.messages[3] as { content: Array<{ type: string; text?: string }> };
    const text = result.content.map((b) => b.text ?? '').join('');
    expect(text).toContain('keep me'); // meaningful tail survives
    expect(text).not.toContain('eeee'); // strippable example wall removed
    expect(text.length).toBeLessThan(raw.length);
    // The assistant call is kept with its toolCall block untouched for id pairing.
    const call = res.messages[2] as { content: Array<{ type: string; id?: string; name?: string; arguments?: unknown }> };
    expect(call.content[0]).toEqual({ type: 'toolCall', id: 'tc-1', name: 'read', arguments: { path: 'a' } });
  });

  it('compression can occur WITHOUT any drop — older units stay raw, compacted=true', () => {
    const messages = [systemMsg('sys'), userMsg('go'), asstToolCall('tc-1'), toolResult('tc-1', compressible(800))];
    const res = compactTranscriptToFit(messages, 100); // compressed unit ≈ 12 fits; no unit is dropped
    expect(res.compacted).toBe(true);
    expect(rolesOf(res.messages)).toEqual(['system', 'user', 'assistant', 'toolResult']); // everything kept
    const user = res.messages[1] as { content?: string };
    expect(user.content).toBe('go'); // older unit uncompressed (raw fit)
    const result = res.messages[3] as { content: Array<{ text?: string }> };
    expect(result.content[0].text).not.toBe(compressible(800)); // newest compressed
  });

  it('drops an INCOMPRESSIBLE over-budget TOOL unit — the pinned user query still survives', () => {
    // 'x'-wall has nothing strippable → compressed === raw → the unit cannot
    // fit → dropped. The pinned newest user message survives (bug 3); the
    // caller (intra-turn-budget-gate, BR-09) rejects an actually-unfitting
    // request (e.g. an over-budget pinned user) — never a userless transcript.
    const messages = [systemMsg('sys'), userMsg('go'), ...toolUnit('tc-1', 100)];
    const res = compactTranscriptToFit(messages, 50);
    expect(res.compacted).toBe(true);
    // SA4E-368: the tombstone (~40 tokens) fits alongside the pinned user,
    // so the model still knows the dropped read already happened (v1.53.8:
    // USER role, placed BEFORE the user query — never trailing).
    expect(rolesOf(res.messages)).toEqual(['system', 'user', 'user']);
    expect(resultIdsOf(res.messages)).toEqual([]);
  });

  it('compresses thinking blocks as well as text blocks', () => {
    const asstThinking = {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Tip: bad\nkeep' }, // Tip boilerplate strippable
        { type: 'text', text: 'ok' },
      ],
      timestamp: 0,
    } as Message;
    const messages = [systemMsg('sys'), asstThinking];
    const res = compactTranscriptToFit(messages, 3); // raw ≈ 6 tokens; compressed = 3 ≤ 3
    expect(res.compacted).toBe(true);
    const content = (res.messages[1] as { content: Array<{ type: string; thinking?: string; text?: string }> }).content;
    expect(content[0].thinking).toBe('keep');
    expect(content[1].text).toBe('ok');
  });
});
