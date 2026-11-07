import type { PipelineState } from './types/pi-workflow-state.js';

/**
 * Per-tab pipeline state + chat history store for PiWorkflowAdapter.
 * Extracted from the adapter to keep each file within the 200-line code standard.
 */
export class PiStateStore {
  private readonly states = new Map<string, PipelineState>();
  private readonly histories = new Map<string, any[]>();
  private activeTabId = '';
  /** ticketKey of the state belonging to the currently active tab — used by cancel() to avoid cancelling other tabs. */
  private activeTicketKey: string | undefined;

  get activeTab(): string {
    return this.activeTabId;
  }

  /** Remember which ticketKey belongs to the active tab, so cancel() only cancels that tab. */
  setActiveTicketKey(key: string): void {
    this.activeTicketKey = key;
  }

  /** Get the PipelineState of the active tab, or undefined if none is tracked. */
  getStateForActiveTab(): PipelineState | undefined {
    if (!this.activeTicketKey) return undefined;
    return this.states.get(this.activeTicketKey);
  }

  /** Set pipeline status only for the active tab's state (not every tab). */
  setActiveTabPipelineStatus(status: string): void {
    const state = this.getStateForActiveTab();
    if (state) state.pipelineStatus = status;
  }

  switchTab(tabId: string): void {
    this.activeTabId = tabId;
  }

  getHistory(tabId = this.activeTabId): any[] {
    return this.histories.get(tabId) || [];
  }

  setHistory(messages: any[], tabId = this.activeTabId): void {
    this.activeTabId = tabId;
    this.histories.set(tabId, [...messages]);
  }

  stateFor(ticketKey: string): PipelineState {
    const existing = this.states.get(ticketKey);
    if (existing) return existing;
    const fresh: PipelineState = {
      ticketKey,
      threadId: `${ticketKey}-${Date.now()}`,
      currentPhase: 'requirements',
      pipelineStatus: 'READY',
      chatHistory: [],
      agentOutputs: {},
      errors: [],
    };
    this.states.set(ticketKey, fresh);
    return fresh;
  }

  /**
   * Plain-chat entry: the executor requires a KEY-123-shaped ticketKey, so chat
   * sessions use a CHAT-<timestamp> session identifier (not a Jira ticket).
   */
  chatStateFor(tabId: string): PipelineState {
    const chatKey = `CHAT-${Date.now()}`;
    const fresh: PipelineState = {
      ticketKey: chatKey,
      threadId: `${chatKey}-${tabId}`,
      currentPhase: 'requirements',
      pipelineStatus: 'READY',
      chatHistory: [],
      agentOutputs: {},
      errors: [],
    };
    this.states.set(chatKey, fresh);
    return fresh;
  }

  save(ticketKey: string, state: PipelineState): void {
    this.states.set(ticketKey, state);
  }

  get(ticketKey: string): PipelineState | undefined {
    return this.states.get(ticketKey);
  }

  all(): PipelineState[] {
    return Array.from(this.states.values());
  }

  clear(): void {
    this.states.clear();
    this.histories.clear();
  }
}
