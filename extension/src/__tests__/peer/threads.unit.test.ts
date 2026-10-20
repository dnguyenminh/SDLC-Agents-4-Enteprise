/**
 * SA4E-369 — PeerThreadStore unit tests.
 * STC: TC-306 (BR-11 bound 50, FIFO eviction, pair isolation),
 *      TC-403 (boundary: 50th kept, 51st evicts oldest, snapshot immutability),
 *      TC-414 (normalized pair key — A→B and B→A share ONE thread).
 */
import { describe, expect, it } from 'vitest';
import { THREAD_MAX_ENTRIES } from '../../pi-workflow/peer/constants.js';
import { normalizedPairKey, PeerThreadStore } from '../../pi-workflow/peer/threads.js';
import type { PeerMessage } from '../../pi-workflow/peer/types.js';
import { TAB_A, TAB_B, TAB_C } from './helpers';

function msg(n: number, from = TAB_A, to = TAB_B): PeerMessage {
  return { direction: 'outbound', fromTabId: from, toTabId: to, taskId: `t-${n}`, content: `m${n}`, at: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z` };
}

describe('PeerThreadStore (SA4E-369)', () => {
  it('TC-403: 50th kept, 51st evicts oldest FIFO; length never exceeds 50 (I-5)', () => {
    const store = new PeerThreadStore();
    const key = normalizedPairKey(TAB_A, TAB_B);
    for (let i = 1; i <= THREAD_MAX_ENTRIES + 1; i++) store.append(key, msg(i));
    const snapshot = store.snapshot(key);
    expect(snapshot).toHaveLength(THREAD_MAX_ENTRIES);
    expect(snapshot[0].content).toBe('m2'); // oldest (m1) evicted
    expect(snapshot[snapshot.length - 1].content).toBe('m51'); // newest kept
    expect(THREAD_MAX_ENTRIES).toBe(50);
  });

  it('TC-403 step 3: snapshot is a deep copy — later appends do not mutate it (I-4)', () => {
    const store = new PeerThreadStore();
    const key = normalizedPairKey(TAB_A, TAB_B);
    store.append(key, msg(1));
    const snapshot = store.snapshot(key);
    store.append(key, msg(2));
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].content).toBe('m1');
  });

  it('TC-414: normalized pair key — reverse direction lands in the SAME thread', () => {
    const store = new PeerThreadStore();
    store.append(normalizedPairKey(TAB_A, TAB_B), msg(1));
    store.append(normalizedPairKey(TAB_B, TAB_A), msg(2, TAB_B, TAB_A));
    const forward = store.snapshot(normalizedPairKey(TAB_A, TAB_B));
    const reverse = store.snapshot(normalizedPairKey(TAB_B, TAB_A));
    expect(forward).toHaveLength(2);
    expect(reverse).toEqual(forward);
    expect(forward[0].direction).toBe('outbound');
    expect(forward[1].direction).toBe('outbound'); // as recorded by the caller
  });

  it('TC-306: pair isolation — evictions in (A,B) never touch (A,C)', () => {
    const store = new PeerThreadStore();
    const ab = normalizedPairKey(TAB_A, TAB_B);
    const ac = normalizedPairKey(TAB_A, TAB_C);
    for (let i = 1; i <= THREAD_MAX_ENTRIES + 5; i++) store.append(ab, msg(i));
    store.append(ac, msg(100));
    expect(store.snapshot(ab)).toHaveLength(THREAD_MAX_ENTRIES);
    expect(store.snapshot(ac)).toHaveLength(1);
    expect(store.snapshot(ac)[0].content).toBe('m100');
  });

  it('I-8: dropThreadsInvolving removes every thread mentioning the tab', () => {
    const store = new PeerThreadStore();
    store.append(normalizedPairKey(TAB_A, TAB_B), msg(1));
    store.append(normalizedPairKey(TAB_B, TAB_C), msg(2, TAB_B, TAB_C));
    store.append(normalizedPairKey(TAB_A, TAB_C), msg(3, TAB_A, TAB_C));
    store.dropThreadsInvolving(TAB_B);
    expect(store.size).toBe(1); // only (A,C) survives
    expect(store.snapshot(normalizedPairKey(TAB_A, TAB_C))).toHaveLength(1);
  });

  it('BR-11: THREAD_MAX_ENTRIES constant is 50 (regression guard)', () => {
    expect(THREAD_MAX_ENTRIES).toBe(50);
  });
});
