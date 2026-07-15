/**
 * ConnectionStateTracker — Per-server state machine with event emission.
 * SA4E-37
 */

import type { Logger } from 'pino';
import type {
  ConnectionState,
  ServerConnectionState,
  ServerStateChangeCallback,
  ServerStateChangeEvent,
  ServerStatusEntry,
  Unsubscribe,
} from '../types/health.js';
import { VALID_TRANSITIONS } from '../types/health.js';

export class ConnectionStateTracker {
  private states: Map<string, ServerConnectionState> = new Map();
  private listeners: ServerStateChangeCallback[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'ConnectionStateTracker' });
  }

  register(name: string): void {
    this.states.set(name, {
      name,
      state: 'disconnected',
      lastHealthCheck: null,
      consecutiveFailures: 0,
      reconnectAttempts: 0,
      lastError: null,
      reconnectTimerId: null,
      failureStartedAt: null,
      nextRetryAt: null,
    });
  }

  unregister(name: string): void {
    const entry = this.states.get(name);
    if (entry?.reconnectTimerId) {
      clearTimeout(entry.reconnectTimerId);
    }
    this.states.delete(name);
  }

  getState(name: string): ConnectionState | undefined {
    return this.states.get(name)?.state;
  }

  getEntry(name: string): ServerConnectionState | undefined {
    return this.states.get(name);
  }

  transition(name: string, newState: ConnectionState, error?: string): boolean {
    const entry = this.states.get(name);
    if (!entry) return false;

    const allowed = VALID_TRANSITIONS[entry.state];
    if (!allowed.includes(newState)) {
      this.logger.warn({ server: name, from: entry.state, to: newState }, 'Invalid state transition');
      return false;
    }

    const previousState = entry.state;
    entry.state = newState;
    if (error) entry.lastError = error;

    this.logger.info({ server: name, from: previousState, to: newState }, 'State transition');
    this.emitEvent({ serverName: name, previousState, newState, timestamp: new Date().toISOString(), error });
    return true;
  }

  recordPingSuccess(name: string): void {
    const entry = this.states.get(name);
    if (!entry) return;
    entry.consecutiveFailures = 0;
    entry.lastHealthCheck = new Date().toISOString();
    entry.lastError = null;
  }

  recordPingFailure(name: string, error: string): void {
    const entry = this.states.get(name);
    if (!entry) return;
    entry.consecutiveFailures++;
    entry.lastError = error;
    if (!entry.failureStartedAt) {
      entry.failureStartedAt = new Date().toISOString();
    }
  }

  isThresholdBreached(name: string, threshold: number): boolean {
    const entry = this.states.get(name);
    return (entry?.consecutiveFailures ?? 0) >= threshold;
  }

  resetReconnectState(name: string): void {
    const entry = this.states.get(name);
    if (!entry) return;
    entry.reconnectAttempts = 0;
    entry.consecutiveFailures = 0;
    entry.lastError = null;
    entry.failureStartedAt = null;
    entry.nextRetryAt = null;
    if (entry.reconnectTimerId) {
      clearTimeout(entry.reconnectTimerId);
      entry.reconnectTimerId = null;
    }
  }

  onStateChange(cb: ServerStateChangeCallback): Unsubscribe {
    if (typeof cb !== 'function') {
      throw new TypeError('callback must be a function');
    }
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  getAllStatuses(toolCountFn: (name: string) => number): ServerStatusEntry[] {
    return Array.from(this.states.values()).map((entry) => ({
      name: entry.name,
      state: entry.state,
      connected: entry.state === 'connected',
      toolCount: toolCountFn(entry.name),
      lastHealthCheck: entry.lastHealthCheck,
      consecutiveFailures: entry.consecutiveFailures,
      reconnectAttempts: entry.reconnectAttempts,
      lastError: entry.lastError,
      nextRetryAt: entry.nextRetryAt,
    }));
  }

  private emitEvent(event: ServerStateChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        this.logger.warn({ err, serverName: event.serverName }, 'Listener threw during state change');
      }
    }
  }
}
