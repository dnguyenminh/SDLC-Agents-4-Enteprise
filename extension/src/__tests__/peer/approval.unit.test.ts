/**
 * SA4E-369 — approval unit tests (SEC-01/C1 L3, D6 Option A): peer turns run
 * FAIL-CLOSED behind the ToolApprovalGate — no gate handler ⇒ blocked; user
 * turns never reach the gate. STC: TC-802 (user turns unchanged),
 * TC-108 (blocked batch terminates the turn), TC-603 (fail-closed default).
 */
import { describe, expect, it } from 'vitest';
import { createPeerApprovalExtension, createPeerTurnApprovalHandler } from '../../pi-workflow/peer/approval.js';
import type { InlineExtension } from '@earendil-works/pi-coding-agent';
import type { PeerToolApprovalRequest, TurnOriginTracker } from '../../pi-workflow/peer/types.js';

type ToolCallEvent = { toolCallId: string; toolName: string; input?: Record<string, unknown> };
type ToolCallOutcome = undefined | { block: boolean; reason: string; terminate?: boolean };

function makeExtension(
  tracker: TurnOriginTracker,
  gate: Parameters<typeof createPeerApprovalExtension>[1],
): (event: ToolCallEvent) => Promise<ToolCallOutcome> {
  let handler: ((event: ToolCallEvent) => Promise<ToolCallOutcome>) | undefined;
  const extension: InlineExtension = createPeerApprovalExtension(tracker, gate, 'tab-a');
  const pi = { on: (_event: string, fn: (e: ToolCallEvent) => Promise<ToolCallOutcome>) => { handler = fn; } };
  extension.factory(pi as never);
  if (!handler) throw new Error('tool_call handler not registered');
  return handler;
}

describe('createPeerTurnApprovalHandler (SA4E-369 D6 Option A)', () => {
  it('TC-603: approve decision → { approved: true }', async () => {
    const onPending: PeerToolApprovalRequest[] = [];
    const handler = createPeerTurnApprovalHandler({ requestApproval: async () => ({ decision: 'approve' }) as never }, (r) => onPending.push(r));
    const res = await handler.requestApproval({ toolUseId: 'u1', toolName: 'write_file', input: {}, tabId: 'tab-a' });
    expect(res).toEqual({ approved: true });
    expect(onPending).toHaveLength(1); // notification reached the UI layer
  });

  it('TC-603: deny / malformed decision → { approved: false } with reason', async () => {
    const deny = createPeerTurnApprovalHandler({ requestApproval: async () => ({ decision: 'deny', reason: 'nope' }) as never });
    expect(await deny.requestApproval({ toolUseId: 'u2', toolName: 'bash', input: {}, tabId: 'tab-a' }))
      .toEqual({ approved: false, reason: 'nope' });
    // Malformed/undefined payload is NOT treated as approve (fail-closed).
    const weird = createPeerTurnApprovalHandler({ requestApproval: async () => undefined as never });
    expect(await weird.requestApproval({ toolUseId: 'u3', toolName: 'bash', input: {}, tabId: 'tab-a' }))
      .toEqual({ approved: false, reason: 'Rejected by user' });
  });

  it('TC-603: onPending throwing must never break the gate', async () => {
    const handler = createPeerTurnApprovalHandler({ requestApproval: async () => ({ decision: 'approve' }) as never }, () => {
      throw new Error('UI blew up');
    });
    const res = await handler.requestApproval({ toolUseId: 'u4', toolName: 'bash', input: {}, tabId: 'tab-a' });
    expect(res.approved).toBe(true);
  });
});

describe('createPeerApprovalExtension (peer turns fail-closed)', () => {
  it('TC-802: user turns bypass the gate entirely (undefined = allow, byte-identical)', async () => {
    const tracker: TurnOriginTracker = { current: 'user' };
    const handler = makeExtension(tracker, undefined);
    expect(await handler({ toolCallId: 'e1', toolName: 'write_file' })).toBeUndefined();
    tracker.current = 'peer';
    // Same call under a peer turn IS gated — proves the boundary is origin-based.
    expect(await handler({ toolCallId: 'e1', toolName: 'write_file' })).toEqual({
      block: true,
      reason: 'Peer-turn tool call blocked: no approval gate available (fail-closed).',
    });
  });

  it('TC-603: peer turn with NO gate → blocked (fail-closed, no auto-approve)', async () => {
    const tracker: TurnOriginTracker = { current: 'peer' };
    const handler = makeExtension(tracker, undefined);
    const res = await handler({ toolCallId: 'e2', toolName: 'bash', input: { cmd: 'ls' } });
    expect(res).toMatchObject({ block: true });
    expect(String(res?.reason)).toContain('fail-closed');
  });

  it('TC-108: approved peer tool call proceeds; rejected one blocks AND terminates', async () => {
    const tracker: TurnOriginTracker = { current: 'peer' };
    let decision: boolean;
    const gate = { requestApproval: async () => ({ approved: decision }) };
    const handler = makeExtension(tracker, gate);
    decision = true;
    expect(await handler({ toolCallId: 'e3', toolName: 'bash' })).toBeUndefined();
    decision = false;
    const res = await handler({ toolCallId: 'e4', toolName: 'bash', input: {} });
    expect(res).toMatchObject({ block: true, terminate: true });
    expect(String(res?.reason)).toContain('Peer-turn tool call not approved');
  });
});
