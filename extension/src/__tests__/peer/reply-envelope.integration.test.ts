/**
 * SA4E-369 Phase 5.7 S-05 — the §6.2 dispatch loop stamps the untrusted
 * [PEER REPLY] frame on the INBOUND thread entry too: thread replay that
 * later feeds prompts keeps the provenance (BR-10 verbatim inside markers).
 * STC: TC-109 (thread records the exchange), TC-603 (curated failure marker).
 */
import { describe, expect, it } from 'vitest';
import { normalizedPairKey } from '../../pi-workflow/peer/threads.js';
import { flushTurn, makeHarness, metaFor, TAB_A, TAB_B } from './helpers';

describe('SA4E-369 S-05 — recordExchange inbound thread entry carries the [PEER REPLY] frame', () => {
  it('AC-S05e: completed peer turn → thread inbound content wrapped, reply verbatim inside markers', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    const send: { taskId: string } = await h.bus.send(TAB_A, TAB_B, 'exchange me', 'async', 'agent') as { taskId: string };
    await flushTurn(6); // dispatch runs the turn with the default mock reply

    const entries = h.threads.snapshot(normalizedPairKey(TAB_A, TAB_B));
    expect(entries).toHaveLength(2); // outbound prompt + inbound reply
    expect(entries[0]).toMatchObject({ direction: 'outbound', content: 'exchange me' }); // outbound stays verbatim

    const inbound = entries[1]!;
    expect(inbound.direction).toBe('inbound');
    expect(inbound.taskId).toBe(send.taskId);
    expect(inbound.content).toContain('[PEER REPLY — untrusted agent-to-agent content from a peer tab]');
    expect(inbound.content).toContain('peer tab: tab-b'); // stamped from the replying side
    // BR-10: the raw reply survives verbatim INSIDE the DATA markers.
    expect(inbound.content).toContain('--- begin peer content ---\nmock reply\n--- end peer content ---');
  });

  it('AC-S05f: failure marker still records the PEER_003 frame without leaking internals', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    h.promptTurn.mockRejectedValueOnce(new Error('wall-of-internal /C:/secret/stack'));
    await h.bus.send(TAB_A, TAB_B, 'x', 'async', 'agent');
    await flushTurn(6);
    const entries = h.threads.snapshot(normalizedPairKey(TAB_A, TAB_B));
    const marker = entries.find((e) => e.direction === 'inbound' && e.content.startsWith('[peer task failed'));
    expect(marker).toBeTruthy();
    expect(marker!.content).toContain('PEER_003');
    // SEC-04: raw internals (paths) are curated away.
    expect(marker!.content).not.toContain('secret');
  });
});
