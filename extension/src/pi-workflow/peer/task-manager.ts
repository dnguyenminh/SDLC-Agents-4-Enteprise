/**
 * SA4E-369 — PeerTaskManager: PeerTask store, state machine (TDD §5.4) and the
 * blocking waiter registry. Exactly-once waiter settlement (§5.7 item 5):
 * the waiter map entry is deleted before settling, so the PEER_006 timer and
 * the terminal event can never double-settle. Terminal set is exactly
 * {completed, failed, cancelled} (I-7); PEER_006 is caller-side only.
 */
import { EventEmitter } from 'node:events';
import { POST_TERMINAL_RETENTION_MS } from './constants.js';
import { PEER_MESSAGES, peerError } from './errors.js';
import type { PeerError, PeerTask, PeerTaskState, SendResult } from './types.js';

const TERMINAL_STATES: ReadonlySet<PeerTaskState> = new Set(['completed', 'failed', 'cancelled']);

interface BlockingWaiter {
  taskId: string;
  settle: (result: SendResult) => void;
  timer: NodeJS.Timeout;
}

export class PeerTaskManager {
  private readonly tasks = new Map<string, PeerTask>();
  private readonly waiters = new Map<string, BlockingWaiter>();
  private readonly retention = new Set<NodeJS.Timeout>();
  readonly events = new EventEmitter();

  /** Stores a pre-validated task (bus created it AFTER guards passed, I-7). */
  create(task: PeerTask): PeerTask {
    this.tasks.set(task.taskId, task);
    this.events.emit('updated', structuredClone(task));
    return structuredClone(task);
  }

  /** I-4: deep copy — snapshots never share mutable state with the store. */
  get(taskId: string): PeerTask | undefined {
    const task = this.tasks.get(taskId);
    return task ? structuredClone(task) : undefined;
  }

  /** queued→running; stamps startedAt (§5.4). */
  setRunning(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.state !== 'queued') return;
    task.state = 'running';
    task.startedAt = new Date().toISOString();
    this.publish(task);
  }

  setCompleted(taskId: string, reply: string): void {
    this.terminal(taskId, (task) => {
      task.state = 'completed';
      task.reply = reply;
    });
  }

  setFailed(taskId: string, error: PeerError): void {
    this.terminal(taskId, (task) => {
      task.state = 'failed';
      task.error = error;
    });
  }

  /** PEER_009 — target deregistered while queued, or host teardown. */
  setCancelled(taskId: string, error: PeerError): void {
    this.terminal(taskId, (task) => {
      task.state = 'cancelled';
      task.error = error;
    });
  }

  /**
   * Blocking waiter: settled by exactly one `task:<id>` event or the timeout.
   * Timeout resolves with a PEER_006 error — the task itself is NOT touched
   * and stays pollable (BR-13, TDD §5.4 "not a task state").
   */
  awaitTerminal(taskId: string, timeoutMs: number): Promise<SendResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return Promise.resolve({ taskId, state: 'failed', error: peerError('PEER_008', PEER_MESSAGES.PEER_008(taskId)) });
    }
    if (TERMINAL_STATES.has(task.state)) return Promise.resolve(this.resultOf(task));
    return new Promise<SendResult>((resolve) => {
      let settled = false;
      const settle = (result: SendResult): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        this.waiters.delete(taskId);
        this.events.off(`task:${taskId}`, listener);
        resolve(result);
      };
      const listener = (t: PeerTask): void => settle(this.resultOf(t));
      const timer = setTimeout(
        () => settle({ taskId, state: this.tasks.get(taskId)?.state ?? task.state, error: peerError('PEER_006', PEER_MESSAGES.PEER_006(taskId), { timeoutMs }) }),
        timeoutMs,
      );
      if (timer.unref) timer.unref();
      this.waiters.set(taskId, { taskId, settle, timer });
      this.events.once(`task:${taskId}`, listener);
    });
  }

  /** I-8/PEER_009: cancel every QUEUED task targeted at tabId (running tasks are untouched). */
  cancelQueuedFor(tabId: string, reasonFor: (taskId: string) => PeerError): void {
    for (const task of this.tasks.values()) {
      if (task.toTabId === tabId && task.state === 'queued') {
        this.setCancelled(task.taskId, reasonFor(task.taskId));
      }
    }
  }

  /** §6.5 teardown: reject ALL waiters descriptively; clear retention timers. */
  disposeAll(): void {
    for (const waiter of this.waiters.values()) {
      waiter.settle({
        taskId: waiter.taskId,
        state: this.tasks.get(waiter.taskId)?.state ?? 'running',
        error: peerError('PEER_003', PEER_MESSAGES.TEARDOWN()),
      });
    }
    for (const timer of this.retention) clearTimeout(timer);
    this.retention.clear();
    this.events.removeAllListeners();
  }

  private terminal(taskId: string, apply: (task: PeerTask) => void): void {
    const task = this.tasks.get(taskId);
    if (!task || TERMINAL_STATES.has(task.state)) return; // no transition FROM terminal (PBT-06)
    apply(task);
    task.completedAt = new Date().toISOString();
    this.publish(task);
    this.scheduleRetention(taskId);
  }

  private publish(task: PeerTask): void {
    const copy = structuredClone(task);
    this.events.emit('updated', copy);
    this.events.emit(`task:${task.taskId}`, copy);
  }

  /** Bounded store: terminal tasks are removed after the retention window. */
  private scheduleRetention(taskId: string): void {
    const timer = setTimeout(() => this.tasks.delete(taskId), POST_TERMINAL_RETENTION_MS);
    if (timer.unref) timer.unref();
    this.retention.add(timer);
  }

  private resultOf(task: PeerTask): SendResult {
    return {
      taskId: task.taskId,
      state: task.state,
      reply: task.reply,
      error: task.error,
    };
  }
}
