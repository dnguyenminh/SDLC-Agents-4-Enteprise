/**
 * EventBus — typed publish/subscribe for module lifecycle and tool events.
 * Observer pattern: modules and services communicate via events without direct coupling.
 * Replaces index.ts post-init wiring (getModule() casts) with event-driven setup.
 */

export type EventCallback<T = unknown> = (payload: T) => void | Promise<void>;

export interface Unsubscribe {
  (): void;
}

type EventHandler = { callback: EventCallback; once: boolean };

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on<T>(event: string, callback: EventCallback<T>): Unsubscribe {
    return this.addHandler(event, callback, false);
  }

  once<T>(event: string, callback: EventCallback<T>): Unsubscribe {
    return this.addHandler(event, callback, true);
  }

  off<T>(event: string, callback: EventCallback<T>): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) {
      if (h.callback === callback) { set.delete(h); break; }
    }
    if (set.size === 0) this.handlers.delete(event);
  }

  async emit<T>(event: string, payload: T): Promise<void> {
    const set = this.handlers.get(event);
    if (!set) return;
    const toRemove: EventHandler[] = [];
    for (const handler of set) {
      try {
        await handler.callback(payload);
      } catch { /* subscriber errors never crash the bus */ }
      if (handler.once) toRemove.push(handler);
    }
    for (const h of toRemove) set.delete(h);
    if (set.size === 0) this.handlers.delete(event);
  }

  clear(): void {
    this.handlers.clear();
  }

  private addHandler<T>(event: string, callback: EventCallback<T>, once: boolean): Unsubscribe {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    const handler: EventHandler = { callback: callback as EventCallback<unknown>, once };
    this.handlers.get(event)!.add(handler);
    return () => { const s = this.handlers.get(event); if (s) { s.delete(handler); if (s.size === 0) this.handlers.delete(event); } };
  }
}

export const bus = new EventBus();

export const Events = {
  MODULE_REGISTERED: 'module:registered',
  MODULE_READY: 'module:ready',
  MODULE_ERROR: 'module:error',
  MODULE_STOPPED: 'module:stopped',
  ALL_MODULES_READY: 'all:modules:ready',
  TOOLS_INGESTED: 'tools:ingested',
  TOOL_EXECUTED: 'tool:executed',
  /** Emitted when admin saves an LLM config change — payload: { section, key, value } */
  LLM_CONFIG_CHANGED: 'llm:config:changed',
  /** Emitted when admin saves a TaskWorker config change — payload: { section, key, value } */
  TASK_WORKER_CONFIG_CHANGED: 'taskworker:config:changed',
} as const;
