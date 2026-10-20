/**
 * SA4E-369 — PeerTaskManager unit tests.
 * STC: TC-205/TC-106 (PEER_006 blocking timeout — caller-side only, task
 *      survives and completes), TC-413 (exactly-once waiter settlement),
 *      TC-404 (post-terminal retention 60s — bounded store),
 *      TC-212 (disposeAll teardown), TC-208/TC-310 (cancelQueuedFor PEER_009),
 *      PBT-06 (terminal closure — no transition from terminal states).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOCKING_TIMEOUT_MS, POST_TERMINAL_RETENTION_MS } from '../../pi-workflow/peer/constants.js';
import { PEER_MESSAGES, peerError } from '../../pi-workflow/peer/errors.js';
import { PeerTaskManager } from '../../pi-workflow/peer/task-manager.js';
import type { PeerTask } from '../../pi-workflow/peer/types.js';

function taskOf(id: string, toTabId = 'tab-b'): PeerTask {
  return {
    taskId: id,
    fromTabId: 'tab-a',
    toTabId,
    message: 'hello',
    mode: 'blocking',
    state: 'queued',
    turnOrigin: 'peer',
    createdAt: new Date().toISOString(),
  };
}

describe('PeerTaskManager (SA4E-369)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('TC-002/TC-103: create → get returns a deep copy; poll is side-effect free', () => {
    const mgr = new PeerTaskManager();
    mgr.create(taskOf('t-1'));
    const first = mgr.get('t-1')!;
    first.state = 'failed'; // mutate the snapshot
    expect(mgr.get('t-1')?.state).toBe('queued');
  });

  it('TC-205 (PEER_006): blocking timeout rejects the CALLER; task stays running + pollable', async () => {
    const mgr = new PeerTaskManager();
    mgr.create(taskOf('t-timeout'));
    mgr.setRunning('t-timeout');
    const pending = mgr.awaitTerminal('t-timeout', BLOCKING_TIMEOUT_MS);
    const resultPromise = pending.then((r) => {
      expect(r.error?.code).toBe('PEER_006');
      expect(r.error?.message).toContain('did not complete in time');
      expect(r.state).toBe('running'); // PEER_006 is never a task state
      expect(mgr.get('t-timeout')?.state).toBe('running'); // task survives (BR-13)
    });
    await vi.advanceTimersByTimeAsync(BLOCKING_TIMEOUT_MS + 1);
    await resultPromise;
  });

  it('TC-413: exactly-once settlement — terminal at the same tick as timer expiry', async () => {
    const mgr = new PeerTaskManager();
    mgr.create(taskOf('t-race'));
    mgr.setRunning('t-race');
    const pending = mgr.awaitTerminal('t-race', BLOCKING_TIMEOUT_MS);
    mgr.setCompleted('t-race', 'done');
    // Second terminal attempt is a no-op (PBT-06) — reply unchanged. Asserted before
    // the clock advance because BLOCKING_TIMEOUT+1 also fires the 60s retention timer,
    // which deletes the terminal task; the advance stays last to prove the waiter settles exactly once.
    mgr.setFailed('t-race', peerError('PEER_003', 'late failure'));
    expect(mgr.get('t-race')?.state).toBe('completed');
    await vi.advanceTimersByTimeAsync(BLOCKING_TIMEOUT_MS + 1);
    const result = await pending;
    expect(result.state).toBe('completed');
    expect(result.reply).toBe('done');
  });

  it('TC-404: post-terminal retention — retrievable before 60s, PEER_008-class removal after', async () => {
    const mgr = new PeerTaskManager();
    mgr.create(taskOf('t-retained'));
    mgr.setRunning('t-retained');
    mgr.setCompleted('t-retained', 'reply');
    await vi.advanceTimersByTimeAsync(POST_TERMINAL_RETENTION_MS - 1_000);
    expect(mgr.get('t-retained')?.state).toBe('completed'); // late polls served
    await vi.advanceTimersByTimeAsync(2_000);
    expect(mgr.get('t-retained')).toBeUndefined(); // bounded memory
  });

  it('TC-208/TC-310 (PEER_009): cancelQueuedFor cancels only QUEUED tasks of the target', async () => {
    const mgr = new PeerTaskManager();
    mgr.create(taskOf('t-q1'));
    mgr.create(taskOf('t-q2'));
    mgr.create(taskOf('t-running'));
    mgr.setRunning('t-running');
    const pending = mgr.awaitTerminal('t-q1', BLOCKING_TIMEOUT_MS);
    mgr.cancelQueuedFor('tab-b', (id) => peerError('PEER_009', PEER_MESSAGES.PEER_009(id)));
    expect(mgr.get('t-q1')?.state).toBe('cancelled');
    expect(mgr.get('t-q1')?.error?.message).toContain('target tab closed');
    expect(mgr.get('t-q2')?.state).toBe('cancelled');
    expect(mgr.get('t-running')?.state).toBe('running'); // running untouched (TC-407 separate)
    const result = await pending;
    expect(result.error?.code).toBe('PEER_009');
  });

  it('TC-212 (§6.5): disposeAll rejects every pending waiter with the teardown error', async () => {
    const mgr = new PeerTaskManager();
    mgr.create(taskOf('t-dispose'));
    mgr.setRunning('t-dispose');
    const pending = mgr.awaitTerminal('t-dispose', BLOCKING_TIMEOUT_MS);
    mgr.disposeAll();
    const result = await pending;
    expect(result.error?.code).toBe('PEER_003');
    expect(result.error?.message).toContain('Extension host shutting down');
    expect(mgr.get('t-dispose')?.state).toBe('running');
  });

  it('PBT-06: no transition originates from a terminal state; failed→failed ignored', () => {
    const mgr = new PeerTaskManager();
    mgr.create(taskOf('t-term'));
    mgr.setFailed('t-term', peerError('PEER_003', 'boom'));
    mgr.setCompleted('t-term', 'should-not-apply');
    mgr.setCancelled('t-term', peerError('PEER_009', 'x'));
    const task = mgr.get('t-term')!;
    expect(task.state).toBe('failed');
    expect(task.reply).toBeUndefined();
    expect(task.completedAt).toBeTruthy();
  });

  it('TC-207 edge: awaitTerminal on an unknown taskId resolves with PEER_008-shaped error', async () => {
    const mgr = new PeerTaskManager();
    const result = await mgr.awaitTerminal('t-ghost', 1_000);
    expect(result.error?.message).toContain('Unknown peer task t-ghost');
  });
});
