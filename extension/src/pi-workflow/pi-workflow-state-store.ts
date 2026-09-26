import type { PipelineState } from './types/pi-workflow-state.js';

/**
 * Per-tab pipeline state + chat history store for PiWorkflowAdapter.
 * Extracted from the adapter to keep each file within the 200-line code standard.
 */
export class PiStateStore {
  private readonly states = new Map<string, PipelineState>();
  private readonly histories = new Map<string, any[]>();
  private activeTabId = '';

  get activeTab(): string {
    return this.activeTabId;
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
