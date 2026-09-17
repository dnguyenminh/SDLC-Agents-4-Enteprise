import type { PiWorkflowState, PiInternalState } from './types/pi-workflow-state';
import { PayloadTooLargeError, SerializationError } from './checkpointer-adapter';

export interface ICheckpointerAdapter {
  putCheckpoint(threadId: string, piState: PiInternalState): Promise<any>;
  save(state: PiWorkflowState): Promise<void>;
  load(threadId: string): Promise<PiWorkflowState | null>;
}

const VALID_THREAD_ID = /^([0-9a-fA-F-]{36}|thread-[a-zA-Z0-9-]+)$/;

export class RemoteCheckpointer implements ICheckpointerAdapter {
  private baseUrl: string;
  private authToken?: string;

  constructor(baseUrl?: string, authToken?: string) {
    this.baseUrl = (baseUrl || process.env.PI_API_URL || 'http://localhost:4000').replace(/\/$/, '');
    this.authToken = authToken;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) h['Authorization'] = `Bearer ${this.authToken}`;
    return h;
  }

  private validateThreadId(threadId: string) {
    if (!VALID_THREAD_ID.test(threadId)) {
      throw new Error('Invalid threadId');
    }
  }

  async putCheckpoint(threadId: string, piState: PiInternalState): Promise<any> {
    this.validateThreadId(threadId);
    const payload = JSON.stringify(piState);
    if (payload.length > 10 * 1024 * 1024) {
      throw new PayloadTooLargeError();
    }

    const res = await fetch(`${this.baseUrl}/api/v1/threads/${encodeURIComponent(threadId)}/checkpoint`, {
      method: 'POST',
      headers: this.headers(),
      body: payload,
    });
    if (!res.ok) {
      throw new Error(`Checkpoint failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async save(state: PiWorkflowState): Promise<void> {
    this.validateThreadId(state.threadId);
    const res = await fetch(`${this.baseUrl}/api/v1/threads/${encodeURIComponent(state.threadId)}/state`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(state),
    });
    if (!res.ok) {
      throw new Error(`Save failed: ${res.status} ${await res.text()}`);
    }
  }

  async load(threadId: string): Promise<PiWorkflowState | null> {
    this.validateThreadId(threadId);
    const res = await fetch(`${this.baseUrl}/api/v1/threads/${encodeURIComponent(threadId)}/state`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Load failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<PiWorkflowState>;
  }
}
