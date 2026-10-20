/**
 * SA4E-369 Phase 5.7 S-02 — human approval loop integration (acceptance 2).
 * A peer turn's tool call now reaches a REAL ToolApprovalGate and a human:
 *  - approve  → the tool executes (extension returns undefined),
 *  - deny     → the extension returns { block, terminate: true } and the bus
 *               task settles FAILED (PEER_003 — terminal),
 *  - timeout  → the gate auto-rejects (fail-closed) ⇒ same deny outcome,
 *  - the pending event MUST reach the UI bridge BEFORE the tool executes
 *    (chat:toolApprovalPending surface) and the bridge can resolve it.
 * STC: TC-603 (fail-closed variants), TC-108 (blocked batch terminates).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ToolApprovalGate } from '../../chat/engine/ToolApprovalGate';
import {
  createPeerApprovalExtension,
  createPeerTurnApprovalHandler,
} from '../../pi-workflow/peer/approval.js';
import { PEER_APPROVAL_TIMEOUT_MS } from '../../pi-workflow/peer/constants.js';
import {
  getPeerApprovalGate,
  onPeerApprovalPending,
  peekPeerRuntime,
  resetPeerRuntime,
} from '../../pi-workflow/peer/runtime.js';
import { tryResolvePeerApproval, wirePeerApprovalBridge } from '../../chat-panel/peer-approval-bridge';
import type { PeerToolApprovalRequest } from '../../pi-workflow/peer/types.js';
import { flushTurn, makeHarness, metaFor, TAB_A, TAB_B } from './helpers';

type Outcome = undefined | { block: boolean; reason: string; terminate?: boolean };

/** Binds the inline extension the way create-host does and returns its tool_call handler. */
function toolCallHandler(tracker: { current: 'user' | 'peer' }, handler: ReturnType<typeof createPeerTurnApprovalHandler>): (event: { toolCallId: string; toolName: string; input?: unknown }) => Promise<Outcome> {
  let registered: ((event: { toolCallId: string; toolName: string; input?: unknown }) => Promise<Outcome>) | undefined;
  const extension = createPeerApprovalExtension(tracker, handler, TAB_B);
  extension.factory({ on: (event: string, fn: unknown) => { if (event === 'tool_call') registered = fn as never; } } as never);
  if (!registered) throw new Error('tool_call handler not registered');
  return registered;
}

/** Polls bus.status until the task leaves queued/running (bounded, deterministic). */
async function pollTerminal(h: ReturnType<typeof makeHarness>, taskId: string) {
  for (let i = 0; i < 100; i++) {
    const task = h.bus.status(taskId, TAB_A);
    if (task.state !== 'queued' && task.state !== 'running') return task;
    await new Promise((r) => setTimeout(r, 20));
  }
  return h.bus.status(taskId, TAB_A);
}

describe('SA4E-369 S-02 — peer approval loop reaches a human (acceptance 2)', () => {
  beforeEach(() => { resetPeerRuntime(); });
  afterEach(() => { resetPeerRuntime(); });

  // STC: TC-603 — approve variant resolves through the runtime gate + bridge.
  it('AC-S02a: peer tool-call → human approve → executes (no block), pending event fired to the UI', async () => {
    // The RUNTIME-owned gate — the bridge (tryResolvePeerApproval) resolves it.
    const gate = getPeerApprovalGate();
    const pendings: PeerToolApprovalRequest[] = [];
    const handler = createPeerTurnApprovalHandler(gate, (req) => pendings.push(req));
    const call = toolCallHandler({ current: 'peer' }, handler);

    const outcomePromise = call({ toolCallId: 'tok-1', toolName: 'bash', input: {} });
    // The user answers through the webview loop: chat:toolApproval → bridge.
    await vi.waitFor(() => expect(gate.hasPending('tok-1')).toBe(true));
    expect(pendings).toHaveLength(1); // UI-visible pending (S-02 bridge surface)
    expect(tryResolvePeerApproval('tok-1', 'approve')).toBe(true);
    await expect(outcomePromise).resolves.toBeUndefined(); // executed — NOT blocked
    expect(gate.getMetrics().totalApproved).toBe(1);
  });

  // STC: TC-603 — deny variant; TC-108 — blocked batch terminates the turn.
  it('AC-S02b: deny → { block, terminate: true } and the peer task settles FAILED (PEER_003, terminal)', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));

    // REAL ToolApprovalGate + handler, wired into the bus as the host gate is.
    const gate = new ToolApprovalGate({ timeoutMs: 250 });
    let denied = false;
    const realHandler = createPeerTurnApprovalHandler(gate, () => undefined);
    const tracker = { current: 'peer' as const };
    // The promptTurn mock SIMULATES the SDK running the approval extension on
    // a tool call of the peer turn (the real session host does the same). The
    // "user" denies by rejecting through the gate directly (webview loop).
    h.promptTurn.mockImplementationOnce(async (_text: string, opts?: { turnOrigin?: string }) => {
      expect(opts?.turnOrigin).toBe('peer');
      const call = toolCallHandler(tracker, realHandler);
      const pending = call({ toolCallId: 'tc-deny', toolName: 'bash', input: { cmd: 'rmdir' } });
      await vi.waitFor(() => expect(gate.hasPending('tc-deny')).toBe(true));
      gate.resolveApproval('tc-deny', 'reject'); // human says NO
      const outcome = await pending;
      denied = true;
      if (outcome?.terminate) throw new Error('Peer-turn tool call not approved: rejected'); // the SDK aborts the turn
      return { text: 'should not happen' };
    });

    const send: { taskId: string } = await h.bus.send(TAB_A, TAB_B, 'run something', 'async', 'agent') as { taskId: string };
    const status = await pollTerminal(h, send.taskId);
    await flushTurn();
    expect(denied).toBe(true);
    // The tool call literally never executed — the extension BLOCKED it.
    expect(status).toMatchObject({ state: 'failed' });
    expect(status.error?.code).toBe('PEER_003'); // terminal, curated — no internals
  });

  // STC: TC-603 — timeout variant: fail-closed, bounded wall-clock.
  it('AC-S02c: no human answer → gate TIMEOUT auto-deny (fail-closed, bounded)', async () => {
    const gate = new ToolApprovalGate({ timeoutMs: 60 }); // real gate, real timer — bounded to 60ms
    const runTiny = toolCallHandler({ current: 'peer' }, createPeerTurnApprovalHandler(gate));
    const started = Date.now();
    const outcome = await runTiny({ toolCallId: 'tc-slow', toolName: 'bash' });
    expect(outcome).toMatchObject({ block: true, terminate: true });
    expect(Date.now() - started).toBeGreaterThanOrEqual(55); // the wall-clock bound WORKS
  });

  // S-02 (d): the 120s silent stall is now a bounded 30s window.
  it('AC-S02d: production gate constants — 30s window (was 120s silent stall)', () => {
    expect(PEER_APPROVAL_TIMEOUT_MS).toBe(30_000);
    // The runtime-owned gate exists and resolves through the bridge session.
    const gate = getPeerApprovalGate();
    expect(gate).toBeInstanceOf(ToolApprovalGate);
    expect(gate.pendingCount).toBe(0);
  });

  // S-02 (b): the orphan-pending fix — the webview actually SEES the request.
  it('AC-S02e: bridge forwards peer:approval-pending as chat:toolApprovalPending', () => {
    const sent: Array<{ type?: string; toolId?: string; toolName?: string; peer?: boolean }> = [];
    wirePeerApprovalBridge((msg) => sent.push(msg as never));
    const seen: Array<{ toolUseId?: string; toolName?: string; tabId?: string }> = [];
    // Wire a second bridge-side listener via the runtime event (the bridge does this internally).
    const unsub = onPeerApprovalPending((e) => seen.push(e));
    peekPeerRuntime()?.bus.emit('peer:approval-pending', { tabId: TAB_B, toolName: 'bash', toolUseId: 'rt-e1' });
    unsub();
    const forwarded = sent.filter((m) => m.type === 'chat:toolApprovalPending');
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]).toMatchObject({ peer: true, toolName: 'bash' });
    expect(seen[0]).toMatchObject({ toolName: 'bash', tabId: TAB_B });
  });

  // STC: TC-603 — instant human answer between registerPending and notify.
  it('AC-S02f: fast human answer during pending resolves the REAL runtime gate (no orphan pending)', async () => {
    const gate = getPeerApprovalGate();
    // Simulate: peer handler registers pending, bridge resolves quickly.
    const req = gate.requestApproval('rt-1');
    expect(gate.hasPending('rt-1')).toBe(true);
    expect(tryResolvePeerApproval('rt-1', 'approve')).toBe(true);
    await expect(req).resolves.toMatchObject({ decision: 'approve' });
    expect(gate.hasPending('rt-1')).toBe(false);
  });
});
