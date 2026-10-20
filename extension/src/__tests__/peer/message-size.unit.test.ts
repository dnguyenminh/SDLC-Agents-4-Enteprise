/**
 * SA4E-369 — message size cap unit tests (SEC-03/C2, PEER_010).
 * STC: TC-400 (boundary 16,000 accepted / 16,001 rejected),
 *      TC-209 (oversized rejected pre-creation, pre-guard — zero state),
 *      TC-210 (validation order: PEER_001/002 win over size; size wins over
 *      guards; queue-cap is step 5), TC-604 (10× oversized never reaches the
 *      session host — chunk-loop amplification blocked).
 */
import { describe, expect, it, vi } from 'vitest';
import { INBOUND_QUEUE_CAP, PEER_MESSAGE_MAX_CHARS } from '../../pi-workflow/peer/constants.js';
import { flushTurn, makeHarness, metaFor, TAB_A, TAB_B } from './helpers';

async function rejectionOf(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
    throw new Error('expected the send to be rejected');
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (!e.code?.startsWith('PEER_')) throw err;
    return e as { code: string; message: string };
  }
}

describe('PEER_MESSAGE_MAX_CHARS (SA4E-369 SEC-03)', () => {
  it('TC-400: 16,000 chars accepted — task created and delivered', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    const result = await h.bus.send(TAB_A, TAB_B, 'x'.repeat(PEER_MESSAGE_MAX_CHARS), 'async', 'agent');
    expect(result.state).toBe('queued');
    await flushTurn();
    expect(h.ensureCalls).toHaveLength(1); // reached the session host path
  });

  it('TC-400/TC-209: 16,001 chars rejected PEER_010 — zero state', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    const err = await rejectionOf(h.bus.send(TAB_A, TAB_B, 'x'.repeat(PEER_MESSAGE_MAX_CHARS + 1), 'async', 'agent'));
    expect(err.code).toBe('PEER_010');
    expect(err.message).toContain('16,001 > 16,000');
    expect(h.ensureCalls).toHaveLength(0); // never reached the host
    expect(h.guards.rateWindow(TAB_B)).toHaveLength(0); // no rate slot consumed
    await flushTurn();
    expect(h.threads.size).toBe(0); // no thread entry
  });

  it('TC-210 steps 1-2 (validation order): oversized+unknown → PEER_001; oversized self-send → PEER_002', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    const oversized = 'x'.repeat(PEER_MESSAGE_MAX_CHARS + 1);
    const unknown = await rejectionOf(h.bus.send(TAB_A, 'ghost-tab', oversized, 'async', 'agent'));
    expect(unknown.code).toBe('PEER_001');
    const self = await rejectionOf(h.bus.send(TAB_A, TAB_A, oversized, 'async', 'agent'));
    expect(self.code).toBe('PEER_002');
  });

  it('TC-210 step 3 (validation order): oversized + pair already tripped → PEER_010 wins (size before guards)', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    for (let i = 0; i < 5; i++) {
      const verdict = h.guards.evaluate(TAB_A, TAB_B, 'agent');
      if (verdict.pass) verdict.commit();
    }
    // Oversized send is rejected at the size check (before guards) — it must consume no RATE slot beyond the setup chain itself.
    const preWindow = h.guards.rateWindow(TAB_B).length;
    const err = await rejectionOf(h.bus.send(TAB_A, TAB_B, 'x'.repeat(PEER_MESSAGE_MAX_CHARS + 1), 'async', 'agent'));
    expect(err.code).toBe('PEER_010'); // NOT PEER_004 — size check precedes guards
    expect(h.guards.rateWindow(TAB_B)).toHaveLength(preWindow);
  });

  it('TC-210 step 4 / TC-401 (validation order): valid size + full queue → PEER_005 (queue cap)', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    // Hold B busy with a never-resolving turn so the queue never drains.
    h.promptTurn.mockImplementation(() => new Promise<{ text: string }>(() => undefined));
    // user-origin decouples this queue-cap test from BR-7 chain-5 + BR-8 rate — commitUser stamps neither.
    await h.bus.send(TAB_A, TAB_B, 'first', 'async', 'user'); // becomes running
    await flushTurn(); // let the dispatch loop dequeue 'first' → B busy, queue empty for the 20 fills
    for (let i = 0; i < INBOUND_QUEUE_CAP; i++) {
      await h.bus.send(TAB_A, TAB_B, `q${i}`, 'async', 'user');
    }
    const err = await rejectionOf(h.bus.send(TAB_A, TAB_B, 'overflow', 'async', 'agent'));
    expect(err.code).toBe('PEER_005');
    expect(err.message).toContain('full (20 queued)');
  });

  it('TC-604: 10× oversized (160,000 chars) — PEER_010, no host call, chunk loop never entered', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    const err = await rejectionOf(h.bus.send(TAB_A, TAB_B, 'x'.repeat(PEER_MESSAGE_MAX_CHARS * 10), 'async', 'agent'));
    expect(err.code).toBe('PEER_010');
    expect(h.promptTurn).not.toHaveBeenCalled();
    expect(h.ensureCalls).toHaveLength(0);
  });

  it('TC-405: empty / whitespace-only message rejected at the tool boundary — zero state', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    await expect(h.bus.send(TAB_A, TAB_B, '', 'async', 'agent')).rejects.toMatchObject({ code: 'PEER_010' });
    expect(h.ensureCalls).toHaveLength(0);
  });
});
