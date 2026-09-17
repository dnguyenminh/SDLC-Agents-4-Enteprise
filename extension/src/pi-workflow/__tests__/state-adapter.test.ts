import { describe, it, expect } from 'vitest';
import { StateAdapter } from '../state-adapter';
import type { PiWorkflowState } from '../types/pi-workflow-state';
import { StateMappingError } from '../types/pi-workflow-state';

describe('StateAdapter', () => {
  const adapter = new StateAdapter();

  const baseState: PiWorkflowState = {
    ticketKey: 'SA4E-293',
    threadId: 'thread-123',
    currentPhase: 'phase-2-specification',
    pipelineStatus: 'running',
    chatHistory: [],
    agentOutputs: {},
    errors: [],
  };

  it('toPiState maps core fields and defaults Pi fields', () => {
    const pi = adapter.toPiState(baseState);
    expect(pi.ticketKey).toBe('SA4E-293');
    expect(pi.threadId).toBe('thread-123');
    expect(pi.currentPhase).toBe('phase-2-specification');
    expect(pi.pipelineStatus).toBe('running');
    expect(pi.piSessionId).toBeDefined();
    expect(typeof pi.piSessionId).toBe('string');
    expect(pi.currentAgentId).toBeNull();
    expect(pi.toolCallCount).toBe(0);
  });

  it('toPiState preserves existing Pi fields', () => {
    const state: PiWorkflowState = {
      ...baseState,
      piSessionId: 'pi_sess_abc',
      currentAgentId: 'ba-agent',
      toolCallCount: 5,
    };
    const pi = adapter.toPiState(state);
    expect(pi.piSessionId).toBe('pi_sess_abc');
    expect(pi.currentAgentId).toBe('ba-agent');
    expect(pi.toolCallCount).toBe(5);
  });

  it('fromPiState reconstructs PipelineState', () => {
    const pi = {
      ticketKey: 'SA4E-293',
      threadId: 'thread-1',
      currentPhase: 'phase-1',
      pipelineStatus: 'completed',
      piSessionId: 'sess1',
      currentAgentId: 'sa-agent',
      toolCallCount: 2,
      chatHistory: [{ role: 'user', content: 'hi' }],
      agentOutputs: { ba: {} },
      errors: [],
    };
    const back = adapter.fromPiState(pi);
    expect(back.ticketKey).toBe('SA4E-293');
    expect(back.piSessionId).toBe('sess1');
    expect(back.currentAgentId).toBe('sa-agent');
    expect(back.toolCallCount).toBe(2);
  });

  it('round-trip conversion is lossless for core fields', () => {
    const state: PiWorkflowState = {
      ...baseState,
      chatHistory: [{ role: 'user', content: 'test' }],
      agentOutputs: { ba: { output: 'x' } },
    };
    const round = adapter.roundTrip(state);
    expect(round.ticketKey).toBe(state.ticketKey);
    expect(round.threadId).toBe(state.threadId);
    expect(round.currentPhase).toBe(state.currentPhase);
    expect(round.pipelineStatus).toBe(state.pipelineStatus);
    expect(round.chatHistory).toEqual(state.chatHistory);
    expect(round.agentOutputs).toEqual(state.agentOutputs);
  });

  it('throws StateMappingError on missing ticketKey', () => {
    const bad = { ...baseState, ticketKey: '' };
    expect(() => adapter.toPiState(bad as any)).toThrow(StateMappingError);
  });

  it('throws StateMappingError on invalid ticketKey pattern', () => {
    const bad = { ...baseState, ticketKey: 'invalid' };
    expect(() => adapter.toPiState(bad as any)).toThrow(StateMappingError);
  });

  it('throws StateMappingError on negative toolCallCount', () => {
    const bad = { ...baseState, toolCallCount: -1 };
    expect(() => adapter.toPiState(bad as any)).toThrow(StateMappingError);
  });

  it('generates new piSessionId when missing', () => {
    const s1 = adapter.toPiState(baseState);
    const s2 = adapter.toPiState(baseState);
    expect(s1.piSessionId).not.toBe(s2.piSessionId);
  });
});
