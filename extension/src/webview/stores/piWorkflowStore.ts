import { writable } from 'svelte/store';

export interface PiWorkflowState {
  sessionId: string;
  phase: string;
  providerStatus: 'connected' | 'disconnected' | 'connecting';
}

const initial: PiWorkflowState = {
  sessionId: 'sa4e-289-session',
  phase: 'implementation',
  providerStatus: 'connected',
};

export const piWorkflowState = writable<PiWorkflowState>(initial);

export function updatePiWorkflowState(partial: Partial<PiWorkflowState>) {
  piWorkflowState.update((s) => ({ ...s, ...partial }));
}

export function setPiSessionId(id: string) {
  piWorkflowState.update((s) => ({ ...s, sessionId: id }));
}

export function setPiPhase(phase: string) {
  piWorkflowState.update((s) => ({ ...s, phase }));
}

export function setPiProviderStatus(status: PiWorkflowState['providerStatus']) {
  piWorkflowState.update((s) => ({ ...s, providerStatus: status }));
}
