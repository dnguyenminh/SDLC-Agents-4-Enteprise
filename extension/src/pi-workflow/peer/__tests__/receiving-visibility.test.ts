/**
 * SA4E-369 AC4 — RECEIVING-tab visibility (manual UAT 2026-10-24: "tab nhận
 * không có gì cả" — the bus emitted peer:inbound but nothing subscribed, so
 * badge/prefix/reply never rendered). Locks the full chain:
 *   bus.beginSend → 'peer:inbound' (badge + prefix payload, preview capped)
 *   dispatch.runTurn → 'peer:turn-settled' (reply row / curated failure)
 *   peer-inbound-bridge → chat:peerInbound / chat:peerTurnSettled to webview
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PeerBus } from '../bus.js';
import { dispatchPeerTurn } from '../dispatch.js';
import { initPeerRuntime, peekPeerRuntime, resetPeerRuntime } from '../runtime.js';
import { wirePeerInboundBridge } from '../../../chat-panel/peer-inbound-bridge.js';
import type { PeerInboundEvent, PeerTurnSettledEvent } from '../types.js';
import { makeHarness, metaFor, TAB_A, TAB_B, flushTurn } from '../../../__tests__/peer/helpers.js';

vi.mock('vscode', () => ({}));

function busHarness() {
  return makeHarness({ promptTurn: vi.fn(async () => ({ text: 'review done' })) });
}

describe('peer:inbound — badge/prefix payload (AC4)', () => {
  it('BUS-01: beginSend emits peer:inbound with agentName + capped first-line preview', async () => {
    const h = busHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    const events: PeerInboundEvent[] = [];
    h.bus.on('peer:inbound', (e: PeerInboundEvent) => events.push(e));

    const long = 'first line of a very long task\nsecond line';
    await h.bus.send(TAB_A, TAB_B, long, 'blocking', 'agent');
    await flushTurn();

    expect(events).toHaveLength(1);
    expect(events[0].tabId).toBe(TAB_B);
    expect(events[0].fromTabId).toBe(TAB_A);
    expect(events[0].taskId).toMatch(/^t-/);
    expect(events[0].agentName).toBe(`Agent ${TAB_A.toUpperCase()}`);
    expect(events[0].preview).toBe('first line of a very long task');
  });
});

describe('peer:turn-settled — reply/failure rows (AC4)', () => {
  it('SETTLED-01: completed turn → { ok: true, text } for the receiving tab', async () => {
    const h = busHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    const settled: PeerTurnSettledEvent[] = [];
    h.bus.on('peer:turn-settled', (e: PeerTurnSettledEvent) => settled.push(e));

    await h.bus.send(TAB_A, TAB_B, 'do the review', 'blocking', 'agent');
    await flushTurn();

    expect(settled).toHaveLength(1);
    expect(settled[0].ok).toBe(true);
    expect(settled[0].tabId).toBe(TAB_B);
    expect(settled[0].text).toBe('review done');
  });

  it('SETTLED-02: failing turn → { ok: false, error } (curated)', async () => {
    const h = makeHarness({ promptTurn: vi.fn(async () => { throw new Error('boom /internal/path'); }) });
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    const settled: PeerTurnSettledEvent[] = [];
    h.bus.on('peer:turn-settled', (e: PeerTurnSettledEvent) => settled.push(e));

    await expect(h.bus.send(TAB_A, TAB_B, 'do the review', 'blocking', 'agent')).resolves.toBeTruthy();
    await flushTurn();

    expect(settled).toHaveLength(1);
    expect(settled[0].ok).toBe(false);
    expect(settled[0].error?.code).toBe('PEER_003');
    // SEC-04: raw internals never cross the surface — curated copy only.
    expect(settled[0].error?.message).not.toContain('/internal/path');
  });
});

describe('peer-inbound-bridge — bus → webview forwarding (AC4)', () => {
  beforeEach(() => {
    resetPeerRuntime();
  });

  it('BRIDGE-01: wires ONE subscription and forwards both events to sendToWebview', () => {
    initPeerRuntime(); // real runtime + real bus
    const sendToWebview = vi.fn();
    wirePeerInboundBridge(sendToWebview);

    const bus = peekPeerRuntime()!.bus as PeerBus;
    bus.emit('peer:inbound', { tabId: 't-b', fromTabId: 't-a', taskId: 't-1', agentName: 'Peer A', preview: 'review please' });
    bus.emit('peer:turn-settled', { tabId: 't-b', taskId: 't-1', ok: true, text: 'done' });

    expect(sendToWebview).toHaveBeenCalledTimes(2);
    expect(sendToWebview).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'chat:peerInbound', tabId: 't-b', fromAgentName: 'Peer A', preview: 'review please',
    }));
    expect(sendToWebview).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'chat:peerTurnSettled', tabId: 't-b', ok: true, text: 'done',
    }));
  });

  it('BRIDGE-02: re-wiring replaces the previous subscription (single-slot, no stacking)', () => {
    initPeerRuntime();
    const first = vi.fn();
    const second = vi.fn();
    wirePeerInboundBridge(first);
    wirePeerInboundBridge(second); // latest panel wins

    const bus = peekPeerRuntime()!.bus as PeerBus;
    bus.emit('peer:inbound', { tabId: 't-b', fromTabId: 't-a', taskId: 't-2', agentName: 'X', preview: '' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
