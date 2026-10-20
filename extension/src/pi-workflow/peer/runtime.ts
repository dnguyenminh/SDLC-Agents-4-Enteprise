/**
 * SA4E-369 — peer runtime: the per-extension-host singletons (§5.6). Created
 * lazily on first session-host creation (fail-safe: chat works unchanged when
 * never initialized). Tests use initPeerRuntime/resetPeerRuntime with an
 * injected mock gateway. All state dies with the host (BR-12).
 */
import { ToolApprovalGate } from '../../chat/engine/ToolApprovalGate.js';
import { createPeerTurnApprovalHandler } from './approval.js';
import { PeerBus } from './bus.js';
import { dispatchPeerTurn } from './dispatch.js';
import { AntiLoopGuards } from './guards.js';
import { PeerRegistry } from './registry.js';
import { sessionHostGateway } from './session-gateway.js';
import { PeerTaskManager } from './task-manager.js';
import { PeerThreadStore } from './threads.js';
import type { PeerRegistryRegistration, PeerSessionGateway } from './types.js';

export interface PeerRuntime {
  bus: PeerBus;
  registry: PeerRegistry;
  guards: AntiLoopGuards;
  threads: PeerThreadStore;
  tasks: PeerTaskManager;
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
  const approvalGate = new ToolApprovalGate({ timeoutMs: 120_000 });
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
    dispose: () => {
      bus.dispose();
      approvalGate.dispose();
    },
  };
  return runtime;
}

/** Registers a tab's identity + session-creation inputs (idempotent, I-1). */
export function ensurePeerRuntimeForTab(meta: PeerRegistryRegistration & { tabId: string }): PeerRuntime {
  const rt = initPeerRuntime();
  rt.registry.register(meta.tabId, meta);
  return rt;
}

/** Test hook — full teardown between suites (I-9: nothing survives). */
export function resetPeerRuntime(): void {
  runtime?.dispose();
  runtime = undefined;
}
