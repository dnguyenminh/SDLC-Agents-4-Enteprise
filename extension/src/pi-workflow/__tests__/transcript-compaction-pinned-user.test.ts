/**
 * compactTranscriptToFit — pinned newest user message (SA4E-355 bug 3):
 * reservation before the tool-unit walk, raw/compressed keep rules, and the
 * userless-transcript post-check. Other suites: transcript-compaction.test.ts,
 * -units (atomicity + UC-03), -tombstone (SA4E-368 MANUAL UAT FIX).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Message } from '@earendil-works/pi-ai';
import { logger } from '../../logger';
import { compactTranscriptToFit } from '../transcript-compaction.js';
import {
  systemMsg,
  userMsg,
  asstText,
  textOfTokens,
  toolUnit,
  compressible,
  resultIdsOf,
  rolesOf,
} from './transcript-compaction-helpers.js';

describe('compactTranscriptToFit — pinned newest user message (SA4E-355 bug 3)', () => {
  it('SURVIVES a huge tool history — the trim point never removes the newest user query', () => {
    // UAT bug 3: 79 tool calls pushed the walk's trim point past the opening
    // user message → the compacted transcript had NO user query → llama-server
    // (qwen template) 500 "Jinja Exception: No user query found in messages.".
    // Budget 410: without the pin tc-4 fits and tc-3 sets the trim point, so
    // the user message would be trimmed; with the pin its budget is reserved
    // before the tool walk.
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 200),
      ...toolUnit('tc-2', 200),
      ...toolUnit('tc-3', 200),
      ...toolUnit('tc-4', 200),
    ];
    const res = compactTranscriptToFit(messages, 410);
    expect(res.compacted).toBe(true);
    // v1.53.8: the tombstone note is a USER message too — assert on the REAL
    // query (string content; notes carry a text-block array).
    const queries = res.messages.filter(
      (m) => (m as { role?: string }).role === 'user' && typeof (m as { content?: unknown }).content === 'string'
    );
    expect(queries).toHaveLength(1);
    expect((queries[0] as { content?: string }).content).toBe('go');
  });

  it('ordering: the pinned user message lands after system and BEFORE the kept tool units', () => {
    // Template validity (llama-server/qwen): the compacted transcript must
    // never open with assistant/toolResult — system → user → tool units.
    const messages: Message[] = [
      systemMsg('sys'),
      userMsg('go'),
      ...toolUnit('tc-1', 200),
      ...toolUnit('tc-2', 200),
      ...toolUnit('tc-3', 200),
      ...toolUnit('tc-4', 200),
    ];
    const res = compactTranscriptToFit(messages, 410);
    const roles = rolesOf(res.messages);
    expect(roles[0]).toBe('system');
    expect(roles[1]).toBe('user');
    expect(roles.indexOf('toolResult')).toBeGreaterThan(roles.indexOf('user'));
  });

  it('multi-turn: only the NEWEST user message is pinned — an older user message can still drop', () => {
    // Both user messages are incompressible 80-token walls over budget 60:
    // the newest is pinned (kept even over budget), the oldest is trimmed.
    const messages: Message[] = [systemMsg('sys'), userMsg(textOfTokens(80)), userMsg(textOfTokens(80))];
    const res = compactTranscriptToFit(messages, 60);
    expect(res.compacted).toBe(true);
    const users = res.messages.filter((m) => (m as { role?: string }).role === 'user');
    expect(users).toHaveLength(1);
    expect((users[0] as { content?: string }).content).toBe(textOfTokens(80));
  });

  it('multi-turn: the pinned newest user message is kept RAW when it fits its reservation', () => {
    // Budget 60: the 50-token newest user reserves its full raw size; the
    // older 80-token user cannot fit the 10-token leftover → dropped.
    const messages: Message[] = [systemMsg('sys'), userMsg(textOfTokens(80)), userMsg(textOfTokens(50))];
    const res = compactTranscriptToFit(messages, 60);
    const users = res.messages.filter((m) => (m as { role?: string }).role === 'user');
    expect(users).toHaveLength(1);
    expect((users[0] as { content?: string }).content).toBe(textOfTokens(50)); // RAW — not compressed
  });

  it('reservation: a user message that fits the whole budget stays RAW — newer tool units are trimmed to make room', () => {
    // Without the reservation the 86-token tool unit would eat the budget and
    // force the 50-token user message into a (failing) compression — the UAT
    // task-context loss the model showed by repeating identical ls calls.
    const messages: Message[] = [systemMsg('sys'), userMsg(textOfTokens(50)), ...toolUnit('tc-1', 80)];
    const res = compactTranscriptToFit(messages, 100);
    expect(res.compacted).toBe(true);
    // v1.53.8: the tombstone note is also role 'user' (array content) — the
    // reservation check targets the REAL query (string content).
    const queries = res.messages.filter(
      (m) => (m as { role?: string }).role === 'user' && typeof (m as { content?: unknown }).content === 'string'
    );
    expect(queries).toHaveLength(1);
    expect((queries[0] as { content?: string }).content).toBe(textOfTokens(50)); // raw, byte-identical
    expect(resultIdsOf(res.messages)).toEqual([]); // the tool unit was trimmed instead
  });

  it('a user message too big raw is kept COMPRESSED when its compressed form fits the budget', () => {
    const raw = compressible(800); // ≈293 tokens raw → ≈9 tokens compressed
    const messages: Message[] = [systemMsg('sys'), userMsg(raw), ...toolUnit('tc-1', 55)];
    const res = compactTranscriptToFit(messages, 60);
    expect(res.compacted).toBe(true);
    // The note (user, array content) precedes the real query (string content).
    const queries = res.messages.filter(
      (m) => (m as { role?: string }).role === 'user' && typeof (m as { content?: unknown }).content === 'string'
    );
    expect(queries).toHaveLength(1);
    const content = (queries[0] as { content?: string }).content ?? '';
    expect(content).toContain('keep me'); // meaningful tail survives compression
    expect(content.length).toBeLessThan(raw.length);
    expect(resultIdsOf(res.messages)).toEqual([]); // tool unit trimmed to fund the reservation
  });

  it('a user message whose compressed form exceeds the WHOLE budget is still kept — the caller REJECTS, no drop', () => {
    // 500-token incompressible user over budget 100: the pin keeps it (over
    // budget) so the caller's BR-09 gate REJECTS — never a userless transcript
    // (the llama-server 500 class). Ordering stays template-valid.
    const messages: Message[] = [systemMsg('sys'), userMsg(textOfTokens(500)), ...toolUnit('tc-1', 30)];
    const res = compactTranscriptToFit(messages, 100);
    expect(res.compacted).toBe(true);
    const users = res.messages.filter((m) => (m as { role?: string }).role === 'user');
    expect(users).toHaveLength(1);
    expect((users[0] as { content?: string }).content).toBe(textOfTokens(500));
    expect(rolesOf(res.messages)).toEqual(['system', 'user', 'assistant', 'toolResult']);
  });

  it('never mutates the input when the pinned user message is compressed (JSON snapshot)', () => {
    const raw = compressible(800);
    const messages: Message[] = [systemMsg('sys'), userMsg(raw), ...toolUnit('tc-1', 55)];
    const snapshot = JSON.stringify(messages);
    compactTranscriptToFit(messages, 60);
    expect(JSON.stringify(messages)).toBe(snapshot);
    expect((messages[1] as { content?: string }).content).toBe(raw); // input user message untouched
  });

  it('post-check: a compaction that ends without any user message logs a warning and returns normally', () => {
    // Exotic userless transcript (no pin target exists): compaction still
    // returns — the warning flags the respondability risk instead of crashing.
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      const messages: Message[] = [systemMsg('sys'), asstText(textOfTokens(100))];
      const res = compactTranscriptToFit(messages, 20);
      expect(res.compacted).toBe(true);
      expect(rolesOf(res.messages)).toEqual(['system']);
      expect(warnSpy.mock.calls.some((c) => c[0] === 'PI_TRANSCRIPT_COMPACTED_NO_USER_QUERY')).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
