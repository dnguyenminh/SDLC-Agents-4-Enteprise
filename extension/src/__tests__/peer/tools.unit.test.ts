/**
 * SA4E-369 — session tools unit tests (D4): peer_list / peer_send / peer_status
 * built in the SA4E-360 custom-tool shape; every failure returns the pi-a2a
 * error envelope { error: { code, message } } — never a thrown tool error.
 * STC: TC-601 (peer_list rows are caller-relative deep copies),
 *      TC-602 (peer_send validates + wraps rejections in the envelope),
 *      TC-306 (peer_status unknown taskId → PEER_008, side-effect free).
 */
import { describe, expect, it } from 'vitest';
import { INBOUND_QUEUE_CAP } from '../../pi-workflow/peer/constants.js';
import { TAB_A, TAB_B, TAB_C, flushTurn, makeHarness, metaFor } from './helpers';
import { buildPeerListTool, buildPeerSendTool, buildPeerStatusTool, buildPeerTools } from '../../pi-workflow/peer/tools.js';

describe('peer session tools (SA4E-369 D4)', () => {
  it('TC-601: buildPeerTools binds exactly the 3 a2a tools with name/label/execute', () => {
    const h = makeHarness();
    const tools = buildPeerTools(TAB_A, h.bus);
    expect(tools.map((t) => t.name)).toEqual(['peer_list', 'peer_send', 'peer_status']);
    for (const t of tools) {
      expect(t.label).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.parameters).toBeTruthy();
      expect(typeof t.execute).toBe('function');
    }
  });

  it('TC-601: peer_list returns the a2a text envelope with caller-relative rows', async () => {
    const h = makeHarness();
    h.registry.register(TAB_B, metaFor(TAB_B));
    h.registry.register(TAB_C, metaFor(TAB_C));
    const tool = buildPeerListTool(TAB_A, h.bus);
    const result = (await tool.execute('call-1', {})) as {
      content: Array<{ type: string; text: string }>;
      details: { peers: Array<{ tabId: string; self: boolean }> };
    };
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe('text');
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.details); // text mirrors details
    expect(result.details.peers).toHaveLength(2); // caller TAB_A excluded (I-4)
    expect(result.details.peers.map((p) => p.tabId).sort()).toEqual([TAB_B, TAB_C]);
    expect(result.details.peers.every((p) => !p.self)).toBe(true);
  });

  it('TC-602: peer_send async success returns the queued SendResult envelope', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    const tool = buildPeerSendTool(TAB_A, h.bus);
    const result = (await tool.execute('call-2', { tabId: TAB_B, message: 'hello', async: true })) as {
      content: Array<{ text: string }>;
      details: { taskId: string; state: string };
    };
    expect(result.details.state).toBe('queued');
    expect(result.details.taskId).toMatch(/^t-/);
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.details);
    await flushTurn();
    expect(h.ensureCalls).toHaveLength(1); // delivery reached the session host
  });

  it('TC-602: peer_send rejections are wrapped in the pi-a2a error envelope', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    const tool = buildPeerSendTool(TAB_A, h.bus);
    // Unknown target → PEER_001
    const unknown = (await tool.execute('call-3', { tabId: 'ghost-tab', message: 'x' })) as {
      details: { error: { code: string } };
    };
    expect(unknown.details.error.code).toBe('PEER_001');
    // Oversized message → PEER_010
    const oversized = (await tool.execute('call-4', { tabId: TAB_B, message: 'x'.repeat(16001) })) as {
      details: { error: { code: string; message: string } };
    };
    expect(oversized.details.error.code).toBe('PEER_010');
    // Blank message → PEER_010 tool-boundary validation
    const blank = (await tool.execute('call-5', { tabId: TAB_B, message: '   ' })) as {
      details: { error: { code: string } };
    };
    expect(blank.details.error.code).toBe('PEER_010');
    // Non-object params → same tool-boundary validation
    const junk = (await tool.execute('call-6', undefined)) as { details: { error: { code: string } } };
    expect(junk.details.error.code).toBe('PEER_010');
    await flushTurn();
    expect(h.ensureCalls).toHaveLength(0); // no rejected send reached the host
  });

  it('TC-306: peer_status unknown taskId → PEER_008; non-owner gets the SAME code (no existence oracle)', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    h.registry.register(TAB_C, metaFor(TAB_C));
    const ownerLookup = buildPeerStatusTool(TAB_A, h.bus);
    const foreignLookup = buildPeerStatusTool(TAB_C, h.bus);
    const unknown = (await ownerLookup.execute('call-7', { taskId: 't-ghost' })) as {
      details: { error: { code: string; message: string } };
    };
    expect(unknown.details.error.code).toBe('PEER_008');
    const { taskId } = await h.bus.send(TAB_A, TAB_B, 'owned', 'async', 'user');
    const foreign = (await foreignLookup.execute('call-8', { taskId })) as { details: { error: { code: string } } };
    expect(foreign.details.error.code).toBe('PEER_008'); // caller ≠ sender → same code
    const owner = (await ownerLookup.execute('call-9', { taskId })) as {
      details: { state: string; error?: { code: string } };
    };
    expect(owner.details.state).toBe('queued'); // owner polls fine, no error envelope
    await flushTurn();
  });

  it('TC-401: queue-cap rejection surfaces through peer_send as PEER_005', async () => {
    const h = makeHarness();
    h.registry.register(TAB_A, metaFor(TAB_A));
    h.registry.register(TAB_B, metaFor(TAB_B));
    h.promptTurn.mockImplementation(() => new Promise<{ text: string }>(() => undefined));
    const send = buildPeerSendTool(TAB_A, h.bus);
    await send.execute('call-9', { tabId: TAB_B, message: 'first', async: true });
    await flushTurn(); // first becomes running (B busy), frees its queue slot
    // Bus-level fills use user-origin (commitUser stamps neither BR-7 chain nor BR-8 rate)
    // so ONLY the queue cap is exercised; the tool layer always sends agent-origin.
    for (let i = 0; i < INBOUND_QUEUE_CAP; i++) {
      await h.bus.send(TAB_A, TAB_B, `q${i}`, 'async', 'user');
    }
    const overflow = (await send.execute('call-99', { tabId: TAB_B, message: 'overflow', async: true })) as {
      details: { error: { code: string; message: string } };
    };
    expect(overflow.details.error.code).toBe('PEER_005');
    expect(overflow.details.error.message).toContain('full (20 queued)');
  });
});
