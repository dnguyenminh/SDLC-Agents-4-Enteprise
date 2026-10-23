/**
 * SA4E-369 — peer runtime: the per-extension-host singletons (§5.6). Created
 * lazily on first session-host creation (fail-safe: chat works unchanged when
 * never initialized). Tests use initPeerRuntime/resetPeerRuntime with an
 * injected mock gateway. All state dies with the host (BR-12).
 */
import { ToolApprovalGate } from '../../chat/engine/ToolApprovalGate.js';
import { createPeerTurnApprovalHandler } from './approval.js';
import { PEER_APPROVAL_TIMEOUT_MS } from './constants.js';
import { PeerBus } from './bus.js';
import { dispatchPeerTurn } from './dispatch.js';
import { AntiLoopGuards } from './guards.js';
import { PeerRegistry } from './registry.js';
import { sessionHostGateway, resetSessionHostGatewayContext, setSessionHostGatewayContext } from './session-gateway.js';
import { PeerTaskManager } from './task-manager.js';
import { PeerThreadStore } from './threads.js';
import type { PeerProviderContext, PeerRegistryRegistration, PeerSessionGateway, PeerToolApprovalHandler, PeerToolApprovalRequest } from './types.js';

export interface PeerRuntime {
  bus: PeerBus;
  registry: PeerRegistry;
  guards: AntiLoopGuards;
  threads: PeerThreadStore;
  tasks: PeerTaskManager;
  /** S-02: runtime-owned gate — the webview resolves peer approvals here. */
  approvalGate: ToolApprovalGate;
  dispose(): void;
}

let runtime: PeerRuntime | undefined;

/** Idempotent accessor — initializes with the real session-host gateway. */
export function initPeerRuntime(gateway: PeerSessionGateway = sessionHostGateway): PeerRuntime {
  if (runtime) return runtime;
  const registry = new PeerRegistry();
  const guards = new AntiLoopGuards();
  const threads = new PeerThreadStore();
  const tasks = new PeerTaskManager();
  // S-02 (d): 30s auto-deny (was 120s silent stall) — bounded pending window,
  // the webview sets the label from the forwarded event so the user is never
  // left with an invisible approval. Fail-closed on timeout stays as designed.
  const approvalGate = new ToolApprovalGate({ timeoutMs: PEER_APPROVAL_TIMEOUT_MS });
  let busRef: PeerBus | undefined;
  const approval = createPeerTurnApprovalHandler(approvalGate, (req) => {
    busRef?.emit('peer:approval-pending', {
      tabId: req.tabId,
      toolName: req.toolName,
      toolUseId: req.toolUseId,
    });
  });
  const bus: PeerBus = new PeerBus({
    registry,
    guards,
    tasks,
    threads,
    gateway,
    dispatch: (tabId: string): Promise<void> => dispatchPeerTurn(bus, tabId),
    approval,
  });
  busRef = bus;
  runtime = {
    bus,
    registry,
    guards,
    threads,
    tasks,
    approvalGate,
    dispose: () => {
      bus.dispose();
      approvalGate.dispose();
    },
  };
  return runtime;
}

/** Test/diagnostic + wiring accessor — the live runtime or not-initialized. */
export function peekPeerRuntime(): PeerRuntime | undefined {
  return runtime;
}

/** S-02 (a)/(b) — the runtime-owned ToolApprovalGate (human-resolution entry). */
export function getPeerApprovalGate(): ToolApprovalGate {
  return initPeerRuntime().approvalGate;
}

/**
 * S-02 (a): the fail-closed approval handler that MUST be passed into EVERY
 * ensureSessionHost call — user-path included — so the host cache can never
 * keep a first-winner entry whose peer tool calls would block instantly
 * (approval.ts `!gate ⇒ block`). Undefined only if peer init failed; the host
 * then runs WITHOUT peer tools — the same fail-closed contract (never bypass).
 */
export function peerApprovalGateOrUndefined(): PeerToolApprovalHandler | undefined {
  try {
    return initPeerRuntime().bus.deps.approval ?? undefined;
  } catch {
    return undefined;
  }
}

/** S-02 (b): UI-bridge subscription to `peer:approval-pending`; returns unsubscribe. */
export function onPeerApprovalPending(
  listener: (req: Pick<PeerToolApprovalRequest, 'toolUseId' | 'toolName' | 'tabId'>) => void,
): () => void {
  const bus = initPeerRuntime().bus;
  bus.on('peer:approval-pending', listener);
  return () => bus.off('peer:approval-pending', listener);
}

/** Registers a tab's identity + session-creation inputs (idempotent, I-1). */
export function ensurePeerRuntimeForTab(
  meta: PeerRegistryRegistration & { tabId: string },
  providerContext?: PeerProviderContext
): PeerRuntime {
  const rt = initPeerRuntime();
  if (providerContext) setSessionHostGatewayContext(providerContext);
  rt.registry.register(meta.tabId, meta);
  return rt;
}

/** Test hook — full teardown between suites (I-9: nothing survives). */
export function resetPeerRuntime(): void {
  runtime?.dispose();
  runtime = undefined;
  resetSessionHostGatewayContext();
}
