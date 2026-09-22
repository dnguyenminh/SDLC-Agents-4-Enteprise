import crypto from 'crypto';
import type { PipelineState, PiInternalState } from './types/pi-workflow-state.js';

export class StateMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateMappingError';
  }
}

export class StateAdapter {
  toPiState(state: PipelineState): PiInternalState {
    if (!state || typeof state !== 'object') {
      throw new StateMappingError('Invalid state object');
    }
    if (!state.ticketKey || typeof state.ticketKey !== 'string' || state.ticketKey.trim() === '') {
      throw new StateMappingError('Missing required field: ticketKey');
    }

    return {
      ...state,
      piSessionId: (state.piSessionId as string) || (crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`),
      currentAgentId: (state.currentAgentId as string) || null,
      toolCallCount: typeof state.toolCallCount === 'number' ? state.toolCallCount : 0
    };
  }

  fromPiState(piState: PiInternalState): PipelineState {
    if (!piState || typeof piState !== 'object') {
      throw new StateMappingError('Invalid piState object');
    }
    if (!piState.ticketKey || typeof piState.ticketKey !== 'string' || piState.ticketKey.trim() === '') {
      throw new StateMappingError('Missing required field: ticketKey');
    }

    const { piSessionId, currentAgentId, toolCallCount, ...pipelineState } = piState;
    return {
      ...pipelineState,
      piSessionId,
      currentAgentId,
      toolCallCount
    };
  }
}
