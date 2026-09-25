import { describe, it, expect, beforeEach } from 'vitest';
import { StateAdapter, StateMappingError } from '../state-adapter.js';
import { CheckpointerAdapter, type RemoteCheckpointerStore } from '../checkpointer-adapter.js';
import type { PipelineState, PiInternalState } from '../types/pi-workflow-state.js';

describe('StateAdapter (SA4E-293)', () => {
  let adapter: StateAdapter;

  beforeEach(() => {
    adapter = new StateAdapter();
  });

  it('should throw StateMappingError if ticketKey is missing', () => {
    expect(() => adapter.toPiState({ threadId: 't-1', currentPhase: 'requirements' } as any)).toThrow(
      StateMappingError
    );
  });

  it('should convert PipelineState to PiInternalState with default fields', () => {
    const input: PipelineState = {
      ticketKey: 'SA4E-293',
      threadId: 't-123',
      currentPhase: 'design'
    };

    const result = adapter.toPiState(input);
    expect(result.ticketKey).toBe('SA4E-293');
    expect(result.piSessionId).toBeDefined();
    expect(result.currentAgentId).toBeNull();
    expect(result.toolCallCount).toBe(0);
  });

  it('should preserve existing piSessionId and toolCallCount in toPiState', () => {
    const input: PipelineState = {
      ticketKey: 'SA4E-293',
      threadId: 't-123',
      currentPhase: 'design',
      piSessionId: 'existing-session-456',
      currentAgentId: 'sa-agent',
      toolCallCount: 5
    };

    const result = adapter.toPiState(input);
    expect(result.piSessionId).toBe('existing-session-456');
    expect(result.currentAgentId).toBe('sa-agent');
    expect(result.toolCallCount).toBe(5);
  });

  it('should perform lossless conversion from PiInternalState back to PipelineState', () => {
    const piState: PiInternalState = {
      ticketKey: 'SA4E-293',
      threadId: 't-123',
      currentPhase: 'design',
      piSessionId: 'sess-789',
      currentAgentId: 'sa-agent',
      toolCallCount: 3,
      customField: 'value'
    };

    const result = adapter.fromPiState(piState);
    expect(result.ticketKey).toBe('SA4E-293');
    expect(result.piSessionId).toBe('sess-789');
    expect(result.currentAgentId).toBe('sa-agent');
    expect(result.toolCallCount).toBe(3);
    expect(result.customField).toBe('value');
  });
});

describe('CheckpointerAdapter (SA4E-293)', () => {
  let mockStore: RemoteCheckpointerStore;
  let adapter: CheckpointerAdapter;
  let db: Record<string, PipelineState>;

  beforeEach(() => {
    db = {};
    mockStore = {
      async getCheckpoint(threadId: string) {
        return db[threadId] || null;
      },
      async saveCheckpoint(threadId: string, checkpoint: PipelineState) {
        db[threadId] = checkpoint;
      }
    };
    adapter = new CheckpointerAdapter(mockStore);
  });

  it('should return null when loading non-existent thread', async () => {
    const state = await adapter.loadPiState('non-existent');
    expect(state).toBeNull();
  });

  it('should save and load PiInternalState via RemoteCheckpointerStore', async () => {
    const piState: PiInternalState = {
      ticketKey: 'SA4E-293',
      threadId: 't-999',
      currentPhase: 'test_planning',
      piSessionId: 'sess-999',
      currentAgentId: 'qa-agent',
      toolCallCount: 2
    };

    await adapter.savePiState('t-999', piState);
    const loaded = await adapter.loadPiState('t-999');
    expect(loaded).not.toBeNull();
    expect(loaded?.ticketKey).toBe('SA4E-293');
    expect(loaded?.piSessionId).toBe('sess-999');
    expect(loaded?.currentAgentId).toBe('qa-agent');
  });
});
