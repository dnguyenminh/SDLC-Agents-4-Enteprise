/**
 * dropped-tool-activity tombstone (SA4E-368 — compaction amnesia re-read
 * loop). MANUAL UAT FIX — assertions copied VERBATIM from the original
 * transcript-compaction.test.ts; do not weaken. Other suites:
 * transcript-compaction.test.ts / -units / -pinned-user.
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

describe('dropped-tool-activity tombstone (SA4E-368 — compaction amnesia re-read loop)', () => {
  /** All tombstone note texts in the transcript (role-agnostic — the note is a USER message since v1.53.8). */
  const tombstonesOf = (messages: Message[]): string[] => {
    const out: string[] = [];
    for (const m of messages) {
      const content = (m as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const b of content as Array<{ type?: string; text?: string }>) {
        if (b.type === 'text' && typeof b.text === 'string' && b.text.includes('[context compacted')) out.push(b.text);
      }
    }
    return out;
  };

  const nonSystemTokens = (messages: Message[]): number =>
    messages
      .filter((m) => (m as { role?: string }).role !== 'system')
      .reduce((sum, m) => sum + Math.ceil(flattenContent((m as { content?: unknown }).content).length / 3), 0);

  it('inserts ONE tombstone listing the dropped read targets at the trim boundary', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 200), // dropped (oldest)
      ...toolUnit('tc-2', 200), // kept (newest)
    ];
    const res = compactTranscriptToFit(messages, 260);
    expect(res.compacted).toBe(true);
    const tombs = tombstonesOf(res.messages);
    expect(tombs).toHaveLength(1);
    expect(tombs[0]).toContain('do NOT repeat');
    expect(tombs[0]).toContain('read a'); // the dropped unit's target
    // Position: AFTER the pinned user (the dropped region began after it),
    // BEFORE the newest kept tool unit (the trim boundary). v1.53.8: the note
    // is a USER message — assistant notes get echoed verbatim by local models.
    expect(rolesOf(res.messages)).toEqual(['system', 'user', 'user', 'assistant', 'toolResult']);
    // Budget guarantee: kept content + tombstone never exceeds the budget.
    expect(nonSystemTokens(res.messages)).toBeLessThanOrEqual(260);
  });

  it('dedupes identical dropped targets into one tombstone entry', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 200),
      ...toolUnit('tc-2', 200),
    ];
    // Budget 100: BOTH 206-token units are dropped, but the pinned user (1)
    // + tombstone (~40) still fit → the two identical 'read a' entries
    // collapse into ONE breadcrumb line.
    const res = compactTranscriptToFit(messages, 100);
    const tombs = tombstonesOf(res.messages);
    expect(tombs).toHaveLength(1);
    expect(tombs[0].match(/read a/g)?.length).toBe(1);
    expect(rolesOf(res.messages)).toEqual(['system', 'user', 'user']);
  });

  it('NO tombstone when nothing was dropped (compression-only compaction)', () => {
    const messages: Message[] = [systemMsg('sys'), userMsg('go'), asstToolCall('tc-1'), toolResult('tc-1', compressible(800))];
    const res = compactTranscriptToFit(messages, 100); // unit kept compressed, nothing dropped
    expect(res.compacted).toBe(true);
    expect(tombstonesOf(res.messages)).toEqual([]);
  });

  it('NO tombstone when the dropped units carry no toolCall blocks (text-only history)', () => {
    const messages: Message[] = [systemMsg('sys'), asstText(textOfTokens(400)), userMsg('go')];
    const res = compactTranscriptToFit(messages, 100); // the 400-token assistant text is dropped
    expect(res.compacted).toBe(true);
    expect(tombstonesOf(res.messages)).toEqual([]);
    expect(rolesOf(res.messages)).toEqual(['system', 'user']);
  });

  it('NO tombstone when it cannot fit without sacrificing the NEWEST kept unit', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 200), // dropped
      ...toolUnit('tc-3', 200), // kept (newest) — 206 + user 1 + tombstone > 220 → skip
    ];
    const res = compactTranscriptToFit(messages, 220);
    expect(res.compacted).toBe(true);
    // The newest unit outranks the breadcrumb: it survives, tombstone skipped.
    expect(callIdsOf(res.messages)).toEqual(['tc-3']);
    expect(tombstonesOf(res.messages)).toEqual([]);
  });

  it('evicts an OLDER kept unit to make room for the tombstone — never the newest', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 200), // dropped by the walk (does not fit)
      ...toolUnit('tc-2', 30), // kept by the walk, evicted for the tombstone (older)
      ...toolUnit('tc-3', 30), // kept (newest) — always survives
    ];
    const res = compactTranscriptToFit(messages, 80);
    expect(res.compacted).toBe(true);
    const tombs = tombstonesOf(res.messages);
    expect(tombs).toHaveLength(1);
    expect(tombs[0]).toContain('read a'); // tc-1's activity is the breadcrumb
    expect(callIdsOf(res.messages)).toEqual(['tc-3']); // tc-2 evicted, tc-3 kept
    expect(nonSystemTokens(res.messages)).toBeLessThanOrEqual(80);
  });

  it('the tombstone is a plain USER TEXT note — no toolCall/toolResult blocks (wire-safe, no trailing-echo)', () => {
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 200),
      ...toolUnit('tc-2', 200),
    ];
    const res = compactTranscriptToFit(messages, 260);
    const tomb = res.messages.find((m) => tombstonesOf([m]).length > 0) as {
      role: string;
      content: Array<{ type: string }>;
    };
    expect(tomb.role).toBe('user'); // v1.53.8: was 'assistant' — local models echoed it verbatim
    expect(tomb.content.every((b) => b.type === 'text')).toBe(true);
    // No orphaned pairing was introduced anywhere in the result.
    expect(resultIdsOf(res.messages)).toEqual(callIdsOf(res.messages).length ? ['tc-2'] : []);
  });

  it('v1.53.8: the note is never the LAST message — the pinned user query always closes the transcript', () => {
    // The all-dropped fallback used to insert the note AFTER the pinned user →
    // llama-server "continues" a trailing assistant note → the model echoed the
    // tombstone verbatim as its whole answer (the "không chạy được" UAT).
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 200),
      ...toolUnit('tc-2', 200),
    ];
    const res = compactTranscriptToFit(messages, 100); // both units dropped → fallback insertion
    expect(res.compacted).toBe(true);
    const tombs = tombstonesOf(res.messages);
    expect(tombs).toHaveLength(1);
    const last = res.messages[res.messages.length - 1] as { role?: string; content?: unknown };
    expect(last.role).toBe('user');
    expect(last.content).toBe('go'); // the REAL query, not the note
    const tombIndex = res.messages.findIndex((m) => tombstonesOf([m]).length > 0);
    expect(tombIndex).toBeLessThan(res.messages.length - 1); // note strictly before the query
  });
});
