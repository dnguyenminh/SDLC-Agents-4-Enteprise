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
 * - an incompressible over-budget unit is dropped — the module never emits an
 *   over-budget unit (the system-only-transcript REJECT lives in the caller,
 *   covered by intra-turn-budget-gate.test.ts BR-09 cases);
 * - never mutates the input; returns `{ messages, compacted }`.
 *
 * NOTE: `groupToolUnits` is private — its behavior (tool-unit atomicity,
 * multi-toolResult units, orphan toolResult units) is pinned through the
 * public `compactTranscriptToFit` API.
 */
import { describe, it, expect } from 'vitest';
import type { Message } from '@earendil-works/pi-ai';
import { compactTranscriptToFit, flattenContent } from '../transcript-compaction.js';

const systemMsg = (content: string): Message =>
  ({ role: 'system', content, timestamp: 0 }) as Message;
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

/** One tool unit (assistant toolCall + its result) of ~5+`tokens` tokens. */
const toolUnit = (id: string, tokens: number): Message[] =>
  [asstToolCall(id), toolResult(id, textOfTokens(tokens))];

/** Compressible payload: HTML comment + Tip boilerplate + an Example wall are strippable. */
const compressible = (wallChars: number): string =>
  `Intro.\n\n<!-- internal note -->\n\nTip: boilerplate\n\nExample:\n${'e'.repeat(wallChars)}\n\n# Restored\n\nkeep me`;

const resultIdsOf = (messages: Message[]): string[] =>
  messages
    .filter((m) => (m as { role?: string }).role === 'toolResult')
    .map((m) => (m as { toolCallId?: string }).toolCallId);

const callIdsOf = (messages: Message[]): string[] =>
  messages
    .filter((m) => (m as { role?: string }).role === 'assistant')
    .flatMap((m) => ((m as { content?: Array<{ type?: string; id?: string }> }).content ?? []))
    .filter((b) => b.type === 'toolCall')
    .map((b) => b.id);

const rolesOf = (messages: Message[]): string[] =>
  messages.map((m) => (m as { role?: string }).role);

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

describe('tool-unit atomicity (groupToolUnits via compactTranscriptToFit)', () => {
  it('drops a tool unit ATOMICALLY — a result that alone would fit is never orphaned from its call', () => {
    // unit tc-2 ≈ 205 tokens (call 5 + result 200): the RESULT alone fits
    // budget 200 exactly, but call+result do not → the WHOLE unit must go.
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 200),
      ...toolUnit('tc-2', 200),
    ];
    const res = compactTranscriptToFit(messages, 200);
    expect(res.compacted).toBe(true);
    expect(callIdsOf(res.messages)).toEqual([]); // no orphaned assistant call
    expect(resultIdsOf(res.messages)).toEqual([]); // no orphaned toolResult
    expect(rolesOf(res.messages)).toEqual(['system']); // pinned fixed part only
  });

  it('keeps a MULTI-toolResult unit whole — one call + its two results survive together', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 200),
      asstToolCall('tc-a'),
      toolResult('tc-a', textOfTokens(100)),
      toolResult('tc-b', textOfTokens(100)), // second result of the same unit
    ];
    const res = compactTranscriptToFit(messages, 220); // multi-unit ≈ 205 fits; tc-1 + user do not
    expect(res.compacted).toBe(true);
    expect(callIdsOf(res.messages)).toEqual(['tc-a']);
    expect(resultIdsOf(res.messages)).toEqual(['tc-a', 'tc-b']); // both results kept with their call
    expect(rolesOf(res.messages)).toEqual(['system', 'assistant', 'toolResult', 'toolResult']);
  });

  it('drops a MULTI-toolResult unit whole — both results vanish together with their call', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      asstToolCall('tc-a'),
      toolResult('tc-a', textOfTokens(100)),
      toolResult('tc-b', textOfTokens(100)),
    ];
    const res = compactTranscriptToFit(messages, 100); // neither the unit (205) nor any piece fits safely
    expect(res.compacted).toBe(true);
    expect(callIdsOf(res.messages)).toEqual([]);
    expect(resultIdsOf(res.messages)).toEqual([]); // never just one of the two results
    expect(rolesOf(res.messages)).toEqual(['system']);
  });

  it('treats an ORPHAN toolResult (no preceding assistant toolCall) as its own unit', () => {
    // The orphan follows a user message (no pairing anchor) → standalone unit:
    // it is dropped on its own while the NEWER user message survives.
    const messages: Message[] = [
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
    expect(rolesOf(res.messages)).toEqual(['system', 'assistant', 'toolResult']);
    expect(res.messages.some((m) => (m as { role?: string }).role === 'user')).toBe(false);
  });

  it('the trim point is a hard boundary — older units are dropped EVEN WHEN they would fit', () => {
    // tc-1 (≈55) + kept tc-3 (≈55) = 110 ≤ 120, yet tc-1 must go: walking
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
    expect(rolesOf(res.messages)).toEqual(['system', 'assistant', 'toolResult']);
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
    expect(rolesOf(res.messages)).toEqual(['system', 'system']);
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

describe('compactTranscriptToFit — text compression fallback (UC-03)', () => {
  it('keeps the newest unit COMPRESSED when raw does not fit — toolCall blocks stay intact', () => {
    const raw = compressible(800);
    const messages: Message[] = [systemMsg('sys'), userMsg('go'), asstToolCall('tc-1'), toolResult('tc-1', raw)];
    const res = compactTranscriptToFit(messages, 60); // raw unit ≈ 226 > 60; compressed ≈ 12 ≤ 60
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
    const messages: Message[] = [systemMsg('sys'), userMsg('go'), asstToolCall('tc-1'), toolResult('tc-1', compressible(800))];
    const res = compactTranscriptToFit(messages, 100); // compressed unit ≈ 12 fits; no unit is dropped
    expect(res.compacted).toBe(true);
    expect(rolesOf(res.messages)).toEqual(['system', 'user', 'assistant', 'toolResult']); // everything kept
    const user = res.messages[1] as { content?: string };
    expect(user.content).toBe('go'); // older unit uncompressed (raw fit)
    const result = res.messages[3] as { content: Array<{ text?: string }> };
    expect(result.content[0].text).not.toBe(compressible(800)); // newest compressed
  });

  it('drops an INCOMPRESSIBLE over-budget unit — never emits a unit over budget', () => {
    // 'x'-wall has nothing strippable → compressed === raw → unit cannot fit → dropped.
    // The module returns pinned systems only; the caller (intra-turn-budget-gate,
    // BR-09) is responsible for REJECTING a system-only transcript.
    const messages: Message[] = [systemMsg('sys'), userMsg('go'), ...toolUnit('tc-1', 100)];
    const res = compactTranscriptToFit(messages, 50);
    expect(res.compacted).toBe(true);
    expect(rolesOf(res.messages)).toEqual(['system']);
    expect(resultIdsOf(res.messages)).toEqual([]);
  });

  it('compresses thinking blocks as well as text blocks', () => {
    const asstThinking: Message = {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Tip: bad\nkeep' }, // Tip boilerplate strippable
        { type: 'text', text: 'ok' },
      ],
      timestamp: 0,
    } as Message;
    const messages: Message[] = [systemMsg('sys'), asstThinking];
    const res = compactTranscriptToFit(messages, 3); // raw ≈ 5 tokens; compressed = 2 ≤ 3
    expect(res.compacted).toBe(true);
    const content = (res.messages[1] as { content: Array<{ type: string; thinking?: string; text?: string }> }).content;
    expect(content[0].thinking).toBe('keep');
    expect(content[1].text).toBe('ok');
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
