/**
 * SA4E-42 — per-server serialized task queue with debounce (IR-7).
 * Tasks for one server run strictly sequentially (async mutex via promise chain);
 * different servers run concurrently. Rapid events within the debounce window are
 * coalesced so only the latest task runs. Failures are caught + logged (fail-soft,
 * BR-06) and never break the chain.
 */
import type { Logger } from 'pino';
import { safeError } from './safeError.js';

type Task = () => Promise<void>;

interface ServerQueueState {
  chain: Promise<void>;
  timer: ReturnType<typeof setTimeout> | null;
  pending: Task | null;
}

export class PerServerTaskQueue {
  private readonly states = new Map<string, ServerQueueState>();

  constructor(private readonly logger: Logger, private readonly defaultDebounceMs = 250) {}

  enqueue(server: string, task: Task, debounceMs = this.defaultDebounceMs): void {
    const state = this.getState(server);
    state.pending = task;
    if (state.timer) clearTimeout(state.timer);
    if (debounceMs <= 0) {
      state.timer = null;
      this.flush(server);
      return;
    }
    state.timer = setTimeout(() => this.flush(server), debounceMs);
  }

  /** Flush any pending task immediately and await the chain to drain (tests/shutdown). */
  async settle(server: string): Promise<void> {
    const state = this.states.get(server);
    if (!state) return;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
      this.flush(server);
    }
    await state.chain;
  }

  private flush(server: string): void {
    const state = this.states.get(server);
    if (!state || !state.pending) return;
    const task = state.pending;
    state.pending = null;
    state.timer = null;
    state.chain = state.chain.then(() => this.runSafe(server, task));
  }

  private async runSafe(server: string, task: Task): Promise<void> {
    try {
      await task();
    } catch (e) {
      this.logger.warn(
        { server, phase: 'task', err: safeError(e) },
        'state-change handler error; chain continues',
      );
    }
  }

  private getState(server: string): ServerQueueState {
    let state = this.states.get(server);
    if (!state) {
      state = { chain: Promise.resolve(), timer: null, pending: null };
      this.states.set(server, state);
    }
    return state;
  }
}
