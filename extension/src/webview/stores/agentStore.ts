/**
 * SA4E-85 + SA4E-370 S4 — Agent Store.
 * Tracks available agents, selected agent, loading state, per-tab agent
 * assignments (badge), and switch indicator truthfulness state.
 * Synced from Extension Host via chat:agentsLoaded / chat:agentSwitched messages.
 */

import { writable, derived } from 'svelte/store';
import type { AgentMeta } from '../../chat/types';

/** Internal state shape for agent management */
interface AgentState {
  agents: AgentMeta[];
  selectedAgentId: string | null;
  isLoading: boolean;
  /** tabId -> agentId (per-tab agent badge, S4) */
  activeAgentByTab: Record<string, string>;
  /** Switch indicator state: 'idle' | 'switching' | 'success' | 'error' (S4) */
  switchIndicator: 'idle' | 'switching' | 'success' | 'error';
  switchError: string | null;
}

const initialState: AgentState = {
  agents: [],
  selectedAgentId: null,
  isLoading: true,
  activeAgentByTab: {},
  switchIndicator: 'idle',
  switchError: null,
};

/** Core writable store for agent state */
export const agentState = writable<AgentState>(initialState);

/** Derived: list of available agents */
export const agents = derived(agentState, ($s) => $s.agents);

/** Derived: currently selected agent ID */
export const selectedAgentId = derived(agentState, ($s) => $s.selectedAgentId);

/** Derived: the full selected agent metadata */
export const selectedAgent = derived(agentState, ($s) =>
  $s.agents.find((a) => a.id === $s.selectedAgentId) ?? null
);

/** Derived: loading indicator */
export const isAgentLoading = derived(agentState, ($s) => $s.isLoading);

/** Derived: switch indicator state */
export const switchIndicator = derived(agentState, ($s) => $s.switchIndicator);

/** Derived: switch error message */
export const switchError = derived(agentState, ($s) => $s.switchError);

/** Sync agents from Extension Host broadcast (chat:agentsLoaded) */
export function syncAgents(agents: AgentMeta[]): void {
  agentState.update((s) => ({
    ...s,
    agents,
    isLoading: false,
    // Auto-select first agent if none selected
    selectedAgentId: s.selectedAgentId ?? agents[0]?.id ?? null,
  }));
}

/** Select a specific agent by ID */
export function selectAgent(agentId: string): void {
  agentState.update((s) => ({ ...s, selectedAgentId: agentId, switchIndicator: 'switching', switchError: null }));

  // SA4E-186: Notify Extension Host of agent selection for runtime routing
  try {
    const vscodeApi = (globalThis as any).acquireVsCodeApi?.() ??
      (globalThis as any).__vscodeApi;
    if (vscodeApi?.postMessage) {
      vscodeApi.postMessage({ type: "chat:selectAgent", agentId });
    }
  } catch {
    // Silently ignore if not in VS Code webview context (e.g., tests)
  }
}

/** SA4E-370 S4: record the active agent for a tab (badge update). */
export function setActiveAgentForTab(tabId: string, agentId: string): void {
  agentState.update((s) => ({
    ...s,
    activeAgentByTab: { ...s.activeAgentByTab, [tabId]: agentId },
  }));
}

/** SA4E-370 S4: get the active agent id for a tab (badge lookup). */
export function getActiveAgentForTab(tabId: string): string | null {
  let result: string | null = null;
  agentState.subscribe((s) => {
    result = s.activeAgentByTab[tabId] ?? null;
  })();
  return result;
}

/** SA4E-370 S4: mark switch as successful (indicator: success). */
export function setSwitchSuccess(tabId: string, agentId: string): void {
  agentState.update((s) => ({
    ...s,
    activeAgentByTab: { ...s.activeAgentByTab, [tabId]: agentId },
    switchIndicator: 'success',
    switchError: null,
    selectedAgentId: agentId,
  }));
}

/** SA4E-370 S4: mark switch as failed (indicator: error, badge unchanged). */
export function setSwitchError(error: string): void {
  agentState.update((s) => ({
    ...s,
    switchIndicator: 'error',
    switchError: error,
  }));
}

/** SA4E-370 S4: reset switch indicator to idle. */
export function resetSwitchIndicator(): void {
  agentState.update((s) => ({ ...s, switchIndicator: 'idle', switchError: null }));
}

/** SA4E-370 S3/S4: Sync global selectedAgentId with a tab's active agent (called on tab switch). */
export function syncSelectedAgentWithTab(tabId: string): void {
  agentState.update((s) => {
    const agentId = s.activeAgentByTab[tabId];
    return agentId ? { ...s, selectedAgentId: agentId } : s;
  });
}

/** Reset to initial loading state */
export function resetAgents(): void {
  agentState.set(initialState);
}
