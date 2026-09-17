import type { PiWorkflowState, PiInternalState } from './types/pi-workflow-state';

export class PayloadTooLargeError extends Error {
  constructor(msg = 'Payload too large') { super(msg); this.name = 'PayloadTooLargeError'; }
}
export class SerializationError extends Error {
  constructor(msg = 'Serialization error') { super(msg); this.name = 'SerializationError'; }
}

// StateAdapter for checkpointer removed to avoid duplication. Use state-adapter.ts instead.


export interface ICheckpointerAdapter {
  putCheckpoint(threadId: string, piState: PiInternalState): Promise<any>;
  save(state: PiWorkflowState): Promise<void>;
  load(threadId: string): Promise<PiWorkflowState | null>;
}

export class CheckpointerAdapter implements ICheckpointerAdapter {
  private store = new Map<string, PiInternalState>();
  constructor() {}
  async save(state: PiWorkflowState): Promise<void> {
    this.store.set(state.threadId, state as any);
  }
  async load(threadId: string): Promise<PiWorkflowState | null> {
    return this.store.get(threadId) ?? null;
  }
  async putCheckpoint(threadId: string, piState: PiInternalState): Promise<any> {
    if (!/^([0-9a-fA-F-]{36}|thread-[a-zA-Z0-9-]+)$/.test(threadId)) {
      throw new Error('Invalid threadId');
    }
    const payload = JSON.stringify(piState);
    if (payload.length > 10 * 1024 * 1024) {
      throw new PayloadTooLargeError();
    }
    try {
      JSON.parse(payload);
    } catch {
      throw new SerializationError();
    }
    this.store.set(threadId, piState);
    await new Promise(r => setTimeout(r, 5));
    return { version: 1 };
  }
}
