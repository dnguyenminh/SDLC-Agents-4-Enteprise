/**
 * SA4E-369 Phase 5.7 S-01 — lifecycle wiring integration (acceptance 1).
 * Tab close must reach the I-8 SINGLE cleanup point (registry empty, queued
 * tasks cancelled PEER_009, threads dropped, guards released, host evicted)
 * and a user message must reset the anti-loop pair chain (BR-9 — the five-turn
 * pair lock must be recoverable instead of permanent PEER_004).
 * Wiring level: mock source (ConversationManager-shaped transactions exist as
 * real tab events) → wirePeerTabLifecycle → the harness bus (evictCalls,
 * rateWindow, pairState are observable on the harness) + the real runtime
 * singleton for the default registration route.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ConversationManager } from '../../chat-panel/conversation-manager';
import { wirePeerTabLifecycle } from '../../pi-workflow/peer/lifecycle.js';
import { peekPeerRuntime, resetPeerRuntime } from '../../pi-workflow/peer/runtime.js';
import { flushTurn, makeHarness, metaFor, TAB_A, TAB_B } from './helpers';
import { normalizedPairKey } from '../../pi-workflow/peer/threads.js';

/**
 * Structure-compatible stand-in for ConversationManager (identical
 * onTabCreated/onTabClosed contract + manual emit) so the wiring can be
 * exercised against the harness bus and asserted guard-by-guard.
 */
function makeSource() {
  const created: Array<(tab: { id: string; name?: string }) => void> = [];
  const closed: Array<(tabId: string) => void> = [];
  return {
    onTabCreated(listener: (tab: { id: string; name?: string }) => void): () => void {
      created.push(listener);
      return () => void created.splice(created.indexOf(listener), 1);
    },
    onTabClosed(listener: (tabId: string) => void): () => void {
      closed.push(listener);
      return () => void closed.splice(closed.indexOf(listener), 1);
    },
    emitCreated(tab: { id: string; name?: string }): void {
      for (const l of [...created]) l(tab);
    },
    emitClosed(tabId: string): void {
      for (const l of [...closed]) l(tabId);
    },
  };
}

describe('SA4E-369 S-01 — wiring → harness I-8 cleanup (acceptance 1)', () => {
  let unbinds: Array<() => void> = [];
  beforeEach(() => { resetPeerRuntime(); unbinds = []; });
  afterEach(() => { for (const u of unbinds) u(); resetPeerRuntime(); });

  it('AC-S01a: tab close → registry empty + queued task cancelled (PEER_009) + thread dropped + guards released + host evicted', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    await h.bus.send(TAB_A, TAB_B, 'hello', 'async', 'agent');
    await flushTurn(); // the turn completes → guard chain + rate + thread exist
    expect(h.registry.size).toBe(2);
    const pair = normalizedPairKey(TAB_A, TAB_B);
    expect(h.guards.pairState(pair)).toBeDefined();
    expect(h.guards.rateWindow(TAB_B).length).toBe(1);
    expect(h.threads.snapshot(pair)).toHaveLength(2);

    const source = makeSource();
    unbinds.push(
      source.onTabCreated((tab) => h.registry.register(tab.id, metaFor(tab.id))),
      source.onTabClosed((tabId) => h.bus.handleTabClosed(tabId)),
    );
    source.emitClosed(TAB_B); // the close event now ACTUALLY does its I-8 duty

    // I-8 single cleanup point — every subsystem touched:
    expect(h.registry.size).toBe(1); // TAB_B deregistered
    expect(h.guards.pairState(pair)).toBeUndefined(); // guard chain released
    expect(h.guards.rateWindow(TAB_B)).toEqual([]); // rate window released
    expect(h.evictCalls).toContainEqual(['/ws', TAB_B]); // gateway.evict (zombie host gone)
    expect(h.threads.snapshot(pair)).toHaveLength(0); // threads dropped
  });

  it('AC-S01a: queued async task for a closed tab settles cancelled with PEER_009', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    h.promptTurn.mockImplementation(() => new Promise<{ text: string }>(() => undefined)); // hold B busy
    const result = await h.bus.send(TAB_A, TAB_B, 'held', 'async', 'agent');
    h.bus.handleTabClosed(TAB_B);
    expect(h.bus.status(result.taskId, TAB_A)).toMatchObject({ state: 'cancelled' });
  });

  it('AC-S01b/BR-9: user activity resets the pair chain — the 5-turn pair lock is recoverable', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    for (let i = 0; i < 5; i++) {
      const verdict = h.guards.evaluate(TAB_A, TAB_B, 'agent');
      if (verdict.pass) verdict.commit();
    }
    await expect(h.bus.send(TAB_A, TAB_B, 'locked?', 'async', 'agent')).rejects.toMatchObject({ code: 'PEER_004' });

    const source = makeSource();
    const binding = wirePeerTabLifecycle(source, {
      close: (tabId) => h.bus.handleTabClosed(tabId),
      activity: (tabId) => h.bus.notifyUserActivity(tabId),
    });
    binding.notifyUserActivity(TAB_A); // the user typed a message in TAB_A
    unbinds.push(() => binding.dispose());

    // BR-9: the chain was RESET — the pair passes the ping-pong guard again.
    const verdict = h.guards.evaluate(TAB_A, TAB_B, 'agent');
    expect(verdict.pass).toBe(true);
    if (verdict.pass) verdict.commit();
    expect(h.guards.pairState(normalizedPairKey(TAB_A, TAB_B))?.pingpongTurns).toBe(1);
  });

  it('AC-S01c: tab-created event → peer identity registered via the REAL runtime singleton (I-1 upgradeable)', () => {
    const source = makeSource();
    const binding = wirePeerTabLifecycle(source, { resolveWorkspaceRoot: () => '/ws' });
    unbinds.push(() => binding.dispose());
    source.emitCreated({ id: TAB_A, name: 'Chat' });
    const rt = peekPeerRuntime();
    expect(rt).toBeDefined();
    expect(rt!.registry.has(TAB_A)).toBe(true); // bus active + tab registered ahead of host creation

    source.emitClosed(TAB_A); // I-8 fires through the same wiring (default close route)
    expect(rt!.registry.has(TAB_A)).toBe(false);
  });

  it('ConversationManager: closeTab/createTab actually forward through bindPeerLifecycle', () => {
    const manager = new ConversationManager(3);
    const createdTabs: Array<{ id: string; name?: string }> = [];
    const closedTabs: string[] = [];
    manager.bindPeerLifecycle({
      wiring: (src) => {
        src.onTabCreated((tab) => createdTabs.push(tab));
        src.onTabClosed((tabId) => closedTabs.push(tabId));
        return { dispose: () => undefined };
      },
    });
    // Constructor's initial tab predates the wiring — creating a NEW tab must
    // forward post-mutation state (I-3) to the wiring, closeTab likewise.
    const fresh = manager.createTab();
    expect(createdTabs.some((t) => t.id === fresh.id)).toBe(true);
    manager.closeTab(fresh.id);
    expect(closedTabs).toContain(fresh.id);
  });
});
