/**
 * State Adapter for Pi SDK migration
 * SA4E-293
 */

import { randomUUID } from 'crypto';
import type { PiWorkflowState, PiInternalState } from './types/pi-workflow-state';
import { StateMappingError } from './types/pi-workflow-state';

const TICKET_KEY_REGEX = /^[A-Z0-9]+-\d+$/;

export interface IStateAdapter {
  toPiState(state: PiWorkflowState): PiInternalState;
  fromPiState(piState: PiInternalState): PiWorkflowState;
}

export class StateAdapter implements IStateAdapter {
  private validate(state: PiWorkflowState): void {
    if (!state.ticketKey || !TICKET_KEY_REGEX.test(state.ticketKey)) {
      throw new StateMappingError('Mapping failed: missing required field ticketKey');
    }
    if (state.toolCallCount !== undefined && (!Number.isInteger(state.toolCallCount) || state.toolCallCount < 0)) {
      throw new StateMappingError('Mapping failed: toolCallCount must be >= 0 integer');
    }
    if (!state.threadId) {
      throw new StateMappingError('Mapping failed: missing required field threadId');
    }
    if (!state.currentPhase) {
      throw new StateMappingError('Mapping failed: missing required field currentPhase');
    }
    if (!state.pipelineStatus) {
      throw new StateMappingError('Mapping failed: missing required field pipelineStatus');
    }
  }

  toPiState(state: PiWorkflowState): PiInternalState {
    this.validate(state);

    const piSessionId = state.piSessionId && state.piSessionId.trim().length > 0
      ? state.piSessionId
      : randomUUID();

    const piState: PiInternalState = {
      ...state,
      piSessionId,
      currentAgentId: state.currentAgentId ?? null,
      toolCallCount: state.toolCallCount ?? 0,
      chatHistory: state.chatHistory ?? [],
      agentOutputs: state.agentOutputs ?? {},
      errors: state.errors ?? [],
      ticket: state.ticketKey,
      phase: state.currentPhase,
      status: state.pipelineStatus,
      sessionId: piSessionId,
      agentId: state.currentAgentId ?? '',
      toolCalls: state.toolCallCount ?? 0,
    };

    return piState;
  }

  fromPiState(piState: PiInternalState): PiWorkflowState {
    const ticketKey = piState.ticketKey ?? piState.ticket;
    if (!ticketKey || !TICKET_KEY_REGEX.test(ticketKey)) {
      throw new StateMappingError('Mapping failed: missing required field ticketKey');
    }
    const currentPhase = piState.currentPhase ?? piState.phase;
    const pipelineStatus = piState.pipelineStatus ?? piState.status;
    if (!piState.threadId || !currentPhase || !pipelineStatus) {
      throw new StateMappingError('Mapping failed: missing required field');
    }
    if (piState.toolCallCount !== undefined && (!Number.isInteger(piState.toolCallCount) || piState.toolCallCount < 0)) {
      throw new StateMappingError('Mapping failed: toolCallCount must be >= 0 integer');
    }

    const workflowState: PiWorkflowState = {
      ...piState,
      ticketKey,
      threadId: piState.threadId,
      currentPhase,
      pipelineStatus,
      piSessionId: piState.piSessionId ?? piState.sessionId ?? '',
      currentAgentId: piState.currentAgentId ?? piState.agentId ?? null,
      toolCallCount: piState.toolCallCount ?? piState.toolCalls ?? 0,
      chatHistory: piState.chatHistory ?? [],
      agentOutputs: piState.agentOutputs ?? {},
      errors: piState.errors ?? [],
    };

    return workflowState;
  }

  roundTrip(state: PiWorkflowState): PiWorkflowState {
    const pi = this.toPiState(state);
    const back = this.fromPiState(pi);
    return back;
  }
}

export const stateAdapter = new StateAdapter();
