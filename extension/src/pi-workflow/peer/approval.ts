/**
 * SA4E-369 — SEC-01/C1 L3, D6 Option A: full ToolApprovalGate fail-closed for
 * peer-triggered turns. EVERY tool call inside a peer turn pends explicit
 * human approval (no read-only auto-approve, no autopilot); with no gate
 * handler wired the call is BLOCKED (fail-closed). User turns never reach the
 * gate — turnOrigin defaults to 'user' (AC8 regression boundary).
 */
import type { ToolApprovalGate } from '../../chat/engine/ToolApprovalGate.js';
import type { InlineExtension } from '@earendil-works/pi-coding-agent';
import type { PeerToolApprovalHandler, PeerToolApprovalRequest, TurnOriginTracker } from './types.js';
import { logger } from '../../logger.js';

/** Builds the fail-closed peer-turn handler on top of the SEC-289 gate stack. */
export function createPeerTurnApprovalHandler(
  gate: ToolApprovalGate,
  onPending?: (req: PeerToolApprovalRequest) => void,
): PeerToolApprovalHandler {
  return {
    requestApproval: async (req) => {
      try {
        onPending?.(req);
      } catch { /* notification must never break the gate */ }
      logger.debug('peer turn approval requested', { toolName: req.toolName, tabId: req.tabId });
      const result = (await gate.requestApproval(req.toolUseId)) as { decision?: string; reason?: string };
      if (result?.decision === 'approve') return { approved: true };
      return { approved: false, reason: result?.reason || 'Rejected by user' };
    },
  };
}

/**
 * Inline session extension: routes EVERY tool call of a `turnOrigin === 'peer'`
 * turn through the approval handler. Returns `undefined` (allow) for user
 * turns so existing behavior is byte-identical (TC-802).
 */
export function createPeerApprovalExtension(
  tracker: TurnOriginTracker,
  gate: PeerToolApprovalHandler | undefined,
  tabId: string,
): InlineExtension {
  return {
    name: 'sa4e-peer-approval-gate',
    hidden: true,
    factory: (pi) => {
      pi.on('tool_call', async (event) => {
        if (tracker.current !== 'peer') return undefined; // user turns unchanged (AC8)
        if (!gate) {
          return { block: true, reason: 'Peer-turn tool call blocked: no approval gate available (fail-closed).' };
        }
        const res = await gate.requestApproval({
          toolUseId: event.toolCallId,
          toolName: String(event.toolName),
          input: (event.input ?? {}) as Record<string, unknown>,
          tabId,
        });
        if (res.approved) return undefined;
        return {
          block: true,
          reason: `Peer-turn tool call not approved: ${res.reason ?? 'rejected'}`,
          terminate: true, // abort the turn after the blocked batch (TC-108)
        };
      });
    },
  };
}
