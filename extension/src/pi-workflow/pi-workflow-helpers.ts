import type { PiWorkflowState, PiInternalState } from './types/pi-workflow-state';
import type { IStateAdapter } from './state-adapter';
import type { IPhaseRouter } from './phase-router';
import type { WorkflowStateIO } from './pi-workflow-state-io';

export function buildPersistedState(
  state: any,
  stateAdapter: IStateAdapter,
): PiWorkflowState {
  const piInternal = stateAdapter.toPiState(state as any);
  const workflowState = stateAdapter.fromPiState(piInternal);
  workflowState.ticketKey = state.ticketKey ?? workflowState.ticketKey;
  workflowState.threadId = state.threadId ?? workflowState.threadId;
  workflowState.currentPhase = state.currentPhase ?? workflowState.currentPhase;
  workflowState.pipelineStatus = state.pipelineStatus ?? workflowState.pipelineStatus;
  return workflowState;
}

export async function persistPipelineState(
  state: any,
  stateAdapter: IStateAdapter,
  stateIO: WorkflowStateIO,
) {
  const workflowState = buildPersistedState(state, stateAdapter);
  await stateIO.persistWorkflowState(workflowState);
}

export function adaptAndMerge(
  updatedPiState: any,
  routeResult: any,
  stateAdapter: IStateAdapter,
  ticketKey: string,
  threadId: string,
  currentPhase: string,
  approvalRequested: boolean,
) {
  const routedState = routeResult.updatedState;
  const mergedPiState = { ...updatedPiState, ...routedState };
  if (routeResult.nextPhase) mergedPiState.phase = routeResult.nextPhase;
  else if (routeResult.errors.length > 0) mergedPiState.status = 'paused';
  else mergedPiState.status = 'finished';
  if (routeResult.errors.length) {
    mergedPiState.errors = [...(mergedPiState.errors ?? []), ...routeResult.errors];
  }
  const workflowState = stateAdapter.fromPiState(mergedPiState);
  workflowState.ticketKey = ticketKey;
  workflowState.threadId = threadId;
  workflowState.currentPhase = updatedPiState.phase ?? updatedPiState.currentPhase ?? currentPhase;
  let status: 'running' | 'finished' | 'paused' | 'error' =
    routedState.pipelineStatus || (updatedPiState.status === 'finished' ? 'finished' : 'running');
  if (approvalRequested || routeResult.errors.length > 0) status = 'paused';
  workflowState.pipelineStatus = status as any;
  return workflowState;
}
