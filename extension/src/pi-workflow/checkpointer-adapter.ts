import type { PipelineState, PiInternalState } from './types/pi-workflow-state.js';
import { StateAdapter } from './state-adapter.js';

export interface RemoteCheckpointerStore {
  getCheckpoint(threadId: string): Promise<PipelineState | null>;
  saveCheckpoint(threadId: string, checkpoint: PipelineState): Promise<void>;
}

export class CheckpointerAdapter {
  private stateAdapter = new StateAdapter();

  constructor(private remoteStore?: RemoteCheckpointerStore) {}

  async loadPiState(threadId: string): Promise<PiInternalState | null> {
    if (!this.remoteStore) return null;
    const raw = await this.remoteStore.getCheckpoint(threadId);
    if (!raw) return null;
    return this.stateAdapter.toPiState(raw);
  }

  async savePiState(threadId: string, piState: PiInternalState): Promise<void> {
    if (!this.remoteStore) return;
    const pipelineState = this.stateAdapter.fromPiState(piState);
    await this.remoteStore.saveCheckpoint(threadId, pipelineState);
  }
}
