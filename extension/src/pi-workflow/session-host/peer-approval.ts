/**
 * SA4E-369 — peer/approval wiring for the session host (Phase 5 code
 * standards refactor: extracted verbatim from create-host.ts). Assembles the
 * shared turn-origin tracker (SEC-01/C1 L2), the fail-closed approval-gate
 * session extension (SEC-01/C1 L3, D6 Option A) and the fail-safe peer
 * singleton init + registry tools (D4). Pure wiring — behavior unchanged.
 */
import { debugLog } from '../../debug-logger';
import type { InlineExtension } from '@earendil-works/pi-coding-agent';
import type { PeerBus } from '../peer/bus.js';
import { createPeerApprovalExtension } from '../peer/approval.js';
import { ensurePeerRuntimeForTab } from '../peer/runtime.js';
import { buildPeerTools, type PeerToolDefinition } from '../peer/tools.js';
import type { PeerToolApprovalHandler, TurnOriginTracker } from '../peer/types.js';
import type { SessionHostOptions } from './types.js';

/** Peer wiring bundle consumed by create-host (one per session host). */
export interface PeerSessionWiring {
  /** Shared origin cell — promptTurn stamps it, approval gate reads it. */
  turnOriginTracker: TurnOriginTracker;
  /** Resource-loader extensionFactories (fail-closed peer gate, AC8-safe). */
  extensionFactories: InlineExtension[];
  /** peer_list / peer_send / peer_status — auto in every tab's pool (D4). */
  peerToolDefs: PeerToolDefinition[];
}

/** Registers this tab's peer identity + session-creation inputs (I-1). */
function ensurePeerIdentity(opts: SessionHostOptions, providerId: string): PeerBus {
  return ensurePeerRuntimeForTab(
    {
      tabId: opts.tabId ?? '',
      workspaceRoot: opts.workspaceRoot,
      providerId,
      configuredModelId: opts.configuredModelId ?? '',
      activeAgentId: opts.activeAgentId ?? '',
      agentName: opts.activeAgentId ?? 'Chat',
      role: opts.role ?? '',
      capabilities: [],
      model: opts.configuredModelId ?? 'auto',
      status: 'idle',
    },
    // SA4E-369 UAT layer-3 fix: capture the SAME provider context this host
    // was created with — a peer turn dispatching to a tab with no cached
    // host needs the gateway baseUrl + credentials + bridge to create one
    // exactly like a user turn (first-winner capture, I-1).
    {
      providerId,
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      configuredModelId: opts.configuredModelId,
      mcpBridge: opts.mcpBridge,
      nCtxDetected: opts.nCtxDetected,
    }
  ).bus;
}

/**
 * Wires all session-host peer integration: shared origin tracker +
 * approval-gate extension + registry singletons and their tools.
 */
export function wirePeerSession(opts: SessionHostOptions, providerId: string): PeerSessionWiring {
  const turnOriginTracker: TurnOriginTracker = { current: 'user' };
  // SEC-01/C1 L3 (D6 Option A): peer-turn tool calls route through the
  // fail-closed approval gate, active ONLY when turnOrigin === 'peer'; user
  // turns never reach the gate (AC8). Wired even if peer init fails below.
  const extensionFactories = [
    createPeerApprovalExtension(turnOriginTracker, opts.peerApprovalGate, opts.tabId ?? ''),
  ];
  // Peer singletons + this tab's registry identity (idempotent, I-1).
  let peerToolDefs: PeerToolDefinition[] = [];
  try {
    const bus = ensurePeerIdentity(opts, providerId);
    if (opts.tabId) peerToolDefs = buildPeerTools(opts.tabId, bus);
  } catch (err) {
    // Fail-safe: any peer failure never blocks session creation (chat first).
    debugLog(`[PiSessionHost] peer runtime init skipped: ${(err as Error).message}`);
  }
  return { turnOriginTracker, extensionFactories, peerToolDefs };
}
