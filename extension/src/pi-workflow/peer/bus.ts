/**
 * SA4E-369 — PeerBus: the EventEmitter backbone and the ONLY transport entry
 * (D4 pi-a2a adapter point). Tick-1 atomicity (§5.7): validate → guards →
 * queue → create → enqueue → emit run inside one synchronous block; delivery
 * exits the tick via setImmediate (deps.dispatch). Update-then-emit (I-3);
 * zero-state rejection (I-7); deregister is the single cleanup point (I-8).
 */
import { EventEmitter } from 'node:events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger.js';
import { BLOCKING_TIMEOUT_MS, INBOUND_QUEUE_CAP, PEER_MESSAGE_MAX_CHARS } from './constants.js';
import { PEER_MESSAGES, peerError } from './errors.js';
import { messageContainsForgedMarkers } from './envelope.js';
import type { PeerRegistry } from './registry.js';
import type {
  PeerError,
  PeerInboundEvent,
  PeerRegistryEntry,
  PeerSessionGateway,
  PeerStatusResult,
  PeerTask,
  PeerTaskMode,
  PeerToolApprovalHandler,
  SendResult,
} from './types.js';

export interface PeerBusDeps {
  registry: PeerRegistry;
  guards: import('./guards.js').AntiLoopGuards;
  tasks: import('./task-manager.js').PeerTaskManager;
  threads: import('./threads.js').PeerThreadStore;
  gateway: PeerSessionGateway;
  /** Turn executor wired by runtime.ts — the §6.2 dispatch loop. */
  dispatch: (tabId: string) => Promise<void>;
  /** D6 Option A — fail-closed approval handler passed into peer sessions. */
  approval?: PeerToolApprovalHandler;
}

export class PeerBus extends EventEmitter {
  private readonly inboundQueues = new Map<string, string[]>();
  private readonly busyTabs = new Set<string>();
  private disposed = false;

  constructor(readonly deps: PeerBusDeps) {
    super();
    deps.registry.onRegistered = (entry) =>
      this.emit('peer:registered', { tabId: entry.tabId, agentName: entry.agentName, role: entry.role });
    deps.registry.onDeregistered = (tabId) => this.emit('peer:deregistered', { tabId });
  }

  /** UC-1/FR-1: peer_list — deep-copied registry snapshot (sync, read-only). */
  list(callerTabId: string): { peers: ReturnType<PeerRegistry['snapshot']> } {
    return { peers: this.deps.registry.snapshot(callerTabId) };
  }

  /** UC-3/FR-3: peer_status — deep-copied task snapshot; SEC-05 owner check. */
  status(taskId: string, callerTabId: string): PeerStatusResult {
    const task = this.deps.tasks.get(taskId);
    // Non-owner (≠ sender) gets the SAME PEER_008 — no existence oracle (TC-607).
    if (!task || task.fromTabId !== callerTabId) {
      throw peerError('PEER_008', PEER_MESSAGES.PEER_008(taskId));
    }
    const { taskId: id, state, reply, fromTabId, toTabId, createdAt, startedAt, completedAt, turnOrigin, error } = task;
    return { taskId: id, state, reply, fromTabId, toTabId, createdAt, startedAt, completedAt, turnOrigin, error };
  }

  /** UC-2/UC-3: peer_send — Tick 1 atomic, delivery on the next tick (§5.3). */
  async send(fromTabId: string, targetTabId: string, message: string, mode: PeerTaskMode, origin: 'agent' | 'user'): Promise<SendResult> {
    const task = this.beginSend(fromTabId, targetTabId, message, mode, origin);
    logger.info('peer send accepted', { taskId: task.taskId, fromTabId, toTabId: targetTabId, mode });
    if (mode === 'async') return { taskId: task.taskId, state: 'queued' };
    return this.deps.tasks.awaitTerminal(task.taskId, BLOCKING_TIMEOUT_MS);
  }

  /** BR-9: user message resets the guard chain of every pair the tab belongs to. */
  notifyUserActivity(tabId: string): void {
    this.deps.guards.resetPairsInvolving(tabId);
  }

  /** I-8 single cleanup point: registry + queued tasks + threads + guards + host evict. */
  handleTabClosed(tabId: string): void {
    const workspaceRoot = this.deps.registry.getEntry(tabId)?.workspaceRoot;
    this.deps.registry.deregister(tabId); // fires peer:deregistered AFTER Map.delete (I-3)
    this.deps.tasks.cancelQueuedFor(tabId, (taskId) => peerError('PEER_009', PEER_MESSAGES.PEER_009(taskId)));
    this.inboundQueues.delete(tabId);
    this.deps.threads.dropThreadsInvolving(tabId);
    this.deps.guards.releaseTab(tabId);
    if (workspaceRoot) {
      try {
        this.deps.gateway.evictSessionHost(workspaceRoot, tabId);
      } catch { /* host may not exist — nothing to evict */ }
    }
    logger.info('peer tab closed', { tabId });
  }

  /** §6.5 teardown: reject all waiters, cancel queued tasks, clear all maps. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.deps.tasks.disposeAll();
    this.inboundQueues.clear();
    this.busyTabs.clear();
    this.removeAllListeners();
  }

  // --- Tick 1 (§5.3) — NO await between check and commit (I-2, I-7) ---

  private beginSend(fromTabId: string, targetTabId: string, message: string, mode: PeerTaskMode, origin: 'agent' | 'user'): PeerTask {
    this.assertSendable(fromTabId, targetTabId, message);
    const verdict = this.deps.guards.evaluate(fromTabId, targetTabId, origin);
    if (!verdict.pass) throw verdict.error; // PEER_004/005 — zero state (I-2)
    const queue = this.inboundQueues.get(targetTabId) ?? [];
    if (queue.length >= INBOUND_QUEUE_CAP) {
      throw peerError('PEER_005', PEER_MESSAGES.PEER_005_QUEUE(targetTabId, INBOUND_QUEUE_CAP), { tabId: targetTabId, cap: INBOUND_QUEUE_CAP });
    }
    verdict.commit(); // guards commit only after every rejection point passed
    const task: PeerTask = {
      taskId: `t-${uuidv4()}`,
      fromTabId,
      toTabId: targetTabId,
      message,
      mode,
      state: 'queued',
      turnOrigin: 'peer',
      createdAt: new Date().toISOString(),
    };
    this.deps.tasks.create(task);
    queue.push(task.taskId);
    this.inboundQueues.set(targetTabId, queue);
    const sender = this.deps.registry.getEntry(fromTabId);
    const event: PeerInboundEvent = { tabId: targetTabId, fromTabId, taskId: task.taskId, agentName: sender?.agentName ?? 'unknown' };
    this.emit('peer:inbound', event);
    setImmediate(() => void this.deps.dispatch(targetTabId)); // delivery exits the tick
    return task;
  }

  /** Validation order (TDD §3.3): exists → not self → size ≤ MAX. Zero state. */
  private assertSendable(fromTabId: string, targetTabId: string, message: string): void {
    if (this.disposed) throw peerError('PEER_003', PEER_MESSAGES.TEARDOWN());
    if (!this.deps.registry.has(targetTabId)) {
      throw peerError('PEER_001', PEER_MESSAGES.PEER_001(targetTabId), { tabId: targetTabId });
    }
    if (targetTabId === fromTabId) throw peerError('PEER_002', PEER_MESSAGES.PEER_002());
    if (typeof message !== 'string' || message.length === 0) {
      // SA4E-369 fix batch (review): empty ≠ oversized — same PEER_010 code,
      // separate message so the copy no longer claims "too large" for 0 chars.
      throw peerError('PEER_010', PEER_MESSAGES.PEER_010_EMPTY());
    }
    if (message.length > PEER_MESSAGE_MAX_CHARS) {
      throw peerError('PEER_010', PEER_MESSAGES.PEER_010(message.length, PEER_MESSAGE_MAX_CHARS), { max: PEER_MESSAGE_MAX_CHARS });
    }
    // S-04 (SEC-01 L0): marker forgery — zero-state rejection (I-2, I-7).
    // AFTER the size check; BEFORE guards — no pair state, no queue entry.
    if (messageContainsForgedMarkers(message)) {
      throw peerError('PEER_010', PEER_MESSAGES.PEER_010_FORGERY());
    }
  }

  // --- Internal surface used by dispatch.ts (§6.2) ---

  dequeueForDispatch(tabId: string): string | undefined {
    const queue = this.inboundQueues.get(tabId);
    const taskId = queue?.shift();
    if (queue && queue.length === 0) this.inboundQueues.delete(tabId);
    return taskId;
  }

  markBusy(tabId: string, busy: boolean): void {
    if (busy) this.busyTabs.add(tabId);
    else this.busyTabs.delete(tabId);
  }

  isBusy(tabId: string): boolean {
    return this.busyTabs.has(tabId);
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  /** Exposed for dispatch — the sender fallback needs registry entry shapes. */
  entryOf(tabId: string): PeerRegistryEntry | undefined {
    return this.deps.registry.getEntry(tabId);
  }
}
